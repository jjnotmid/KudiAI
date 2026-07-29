import { randomUUID } from "node:crypto";
import { peekConfirmation, verifyConfirmation } from "@/lib/agent/confirm";
import { runAgent } from "@/lib/agent/run";
import { getMoneyProvider } from "@/lib/bmoni";
import { formatMoney } from "@/lib/money/format";
import { money } from "@/lib/money/types";
import { checkRateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { log } from "@/lib/log";
import type { Channel, IncomingMessage } from "./types";

/**
 * Channel-agnostic message + callback dispatcher. Turns a raw incoming message
 * into an agent reply, and — crucially — executes value-moving actions ONLY when
 * the user taps confirm, re-verifying the HMAC token server-side. The LLM never
 * triggers a transfer.
 */

/** chatId → Kudi session id. */
function sessionFor(chatId: string): string {
  return `tg:${chatId}`;
}

/**
 * Pending confirmations: short ref → { token, sessionId }. Held here because a
 * Telegram callback_data is capped at 64 bytes and the token is longer.
 * Process-local; moving this into the Store is the webhook-multi-instance task.
 */
const pending = new Map<string, { token: string; sessionId: string; expiresAt: number }>();

function stashConfirm(token: string, sessionId: string): string {
  const ref = randomUUID().slice(0, 12);
  pending.set(ref, { token, sessionId, expiresAt: Date.now() + 100_000 });
  return ref;
}

export async function handleMessage(channel: Channel, msg: IncomingMessage): Promise<void> {
  const sessionId = sessionFor(msg.chatId);

  const gate = checkRateLimit(sessionId, "message");
  if (!gate.allowed) {
    await channel.send({ chatId: msg.chatId, text: "You dey go too fast. Wait small make we continue." });
    return;
  }
  if (!msg.text.trim()) {
    await channel.send({ chatId: msg.chatId, text: "Talk to me — check balance, make card, or send money." });
    return;
  }

  const store = getStore();
  try {
    log("info", "msg.in", { sessionId, voice: msg.fromVoice, text: msg.text });
    const priorTurns = await store.loadTurns(sessionId);
    const result = await runAgent(sessionId, priorTurns, msg.text);
    await store.saveTurns(sessionId, result.turns);
    log("info", "msg.out", { sessionId, reply: result.reply, confirm: result.confirm?.slip });

    if (result.confirm) {
      const ref = stashConfirm(result.confirm.token, sessionId);
      await channel.send({
        chatId: msg.chatId,
        text: result.reply || `${result.confirm.slip}?`,
        buttons: [
          [
            { label: `✔ Confirm — ${result.confirm.slip}`, data: `cfm:${ref}`, kind: "confirm" },
            { label: "Cancel", data: `cxl:${ref}`, kind: "cancel" },
          ],
        ],
      });
      return;
    }
    await channel.send({ chatId: msg.chatId, text: result.reply, buttons: renderUi(result.ui) });
  } catch (e) {
    log("error", "dispatch.message_failed", { sessionId, detail: String(e) });
    await channel.send({ chatId: msg.chatId, text: "Something spoil small for my side. Try am again." });
  }
}

export async function handleCallback(
  channel: Channel,
  cb: { chatId: string; data: string; callbackId: string },
): Promise<void> {
  const sessionId = sessionFor(cb.chatId);
  const [kind, ref] = cb.data.split(":");
  log("info", "callback", { sessionId, kind });
  await channel.answerCallback?.(cb.callbackId);

  if (kind === "cxl") {
    if (ref) pending.delete(ref);
    await channel.send({ chatId: cb.chatId, text: "Okay, I no go do am." });
    return;
  }
  if (kind !== "cfm" || !ref) return;

  const entry = pending.get(ref);
  if (!entry || entry.expiresAt < Date.now()) {
    await channel.send({ chatId: cb.chatId, text: "That confirmation don expire. Ask me again." });
    return;
  }
  pending.delete(ref); // one shot

  const payload = peekConfirmation(entry.token);
  if (!payload) {
    await channel.send({ chatId: cb.chatId, text: "I no fit read that confirmation. Try am again." });
    return;
  }

  // Re-verify the signed token against its own payload (signature + expiry).
  const verify = verifyConfirmation(entry.token, {
    sessionId,
    action: payload.action,
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    beneficiaryId: payload.beneficiaryId,
    to: payload.to,
  });
  if (!verify.ok) {
    log("warn", "confirm.rejected", { sessionId, reason: verify.reason });
    const text = verify.reason === "expired" ? "That confirmation don expire. Ask me again." : "I couldn't verify that. Nothing moved.";
    await channel.send({ chatId: cb.chatId, text });
    return;
  }

  // Single-use: consume the nonce. A replay returns false.
  const fresh = await getStore().consumeNonce(sessionId, payload.nonce);
  if (!fresh) {
    await channel.send({ chatId: cb.chatId, text: "We don already do that one." });
    return;
  }

  const writeGate = checkRateLimit(sessionId, "write");
  if (!writeGate.allowed) {
    await channel.send({ chatId: cb.chatId, text: "Too many money moves right now. Wait small." });
    return;
  }

  const provider = getMoneyProvider();
  const amount = money(payload.amountMinor, payload.currency);
  try {
    if (payload.action === "transfer" && payload.beneficiaryId) {
      const res = await provider.transfer(
        { sessionId },
        { amount, beneficiaryId: payload.beneficiaryId, idempotencyKey: payload.nonce },
      );
      if (!res.ok) {
        await channel.send({ chatId: cb.chatId, text: res.error.userMessage });
        return;
      }
      await recordOutcome(sessionId, `Sent ${formatMoney(res.data.amount)} to ${res.data.beneficiaryName}. Balance now ${formatMoney(res.data.balanceAfter)}.`);
      await channel.send({
        chatId: cb.chatId,
        text: `Done. I don send ${formatMoney(res.data.amount)} give ${res.data.beneficiaryName}.\nBalance now: ${formatMoney(res.data.balanceAfter)}`,
      });
    } else if (payload.action === "convert" && payload.to) {
      const res = await provider.convert(
        { sessionId },
        { amount, to: payload.to, idempotencyKey: payload.nonce },
      );
      if (!res.ok) {
        await channel.send({ chatId: cb.chatId, text: res.error.userMessage });
        return;
      }
      await recordOutcome(sessionId, `Converted ${formatMoney(res.data.from)} to ${formatMoney(res.data.to)}.`);
      await channel.send({
        chatId: cb.chatId,
        text: `Done. ${formatMoney(res.data.from)} don become ${formatMoney(res.data.to)} (${res.data.rateDisplay}).`,
      });
    }
  } catch (e) {
    log("error", "confirm.execute_failed", { sessionId, detail: String(e) });
    await channel.send({ chatId: cb.chatId, text: "The money service no respond. Nothing moved — try again." });
  }
}

/** Append a truthful outcome note to history so the agent's context stays honest. */
async function recordOutcome(sessionId: string, note: string): Promise<void> {
  const store = getStore();
  const turns = await store.loadTurns(sessionId);
  await store.saveTurns(sessionId, [...turns, { role: "assistant", text: note }]);
}

/** Rich channels could render chips; on Telegram the reply text carries it. */
function renderUi(_ui: unknown): undefined {
  return undefined;
}
