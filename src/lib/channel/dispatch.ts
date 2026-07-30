import { randomInt, randomUUID } from "node:crypto";
import { createConfirmation, peekConfirmation, verifyConfirmation } from "@/lib/agent/confirm";
import { sendVerificationEmail } from "@/lib/email";
import { hashPin, isValidPinFormat, resolvePinSetup, verifyPin } from "@/lib/agent/pin";
import { runAgent } from "@/lib/agent/run";
import { getLiveMoneyProvider, getMoneyProvider } from "@/lib/bmoni";
import { parseTransferDraft } from "@/lib/bmoni/banks";
import { createBmoniAccount, deleteAccount, finalizeKyc, getReceiveAddress, submitKycProfile, uploadKycSelfie } from "@/lib/bmoni/onboard";
import { formatMoney } from "@/lib/money/format";
import { parseAmount } from "@/lib/money/parse";
import { money, type Money } from "@/lib/money/types";
import { checkRateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import type { KudiEvent } from "@/lib/store/types";
import { log } from "@/lib/log";
import type { Channel, IncomingMessage } from "./types";

/**
 * Channel-agnostic dispatcher. Flow:
 *  1. First contact → onboard, ask the user to set a 4-digit transaction PIN.
 *  2. Normal chat → the agent. A value-moving intent produces a slip.
 *  3. To send, the user enters their PIN (verified server-side) — this, plus the
 *     HMAC token re-check + single-use nonce, is what authorises the transfer.
 *     The LLM never triggers money movement.
 */

const LARGE_TRANSFER_MINOR = 5_000_000; // ₦50,000 → flag for the admin (not block)
const TXN_FEE_MINOR = 2_500; // ₦25 flat fee on every money move (revenue)
const CARD_FEE_MINOR = 20_000; // ₦200 to issue a virtual card (revenue)
const USD_ACCOUNT_FEE_MINOR = 50_000; // ₦500 to open a USD account (revenue)
const SESSION_LOCK_MS = 2 * 60_000; // idle this long → require the login PIN on return

// Persistent reply keyboard docked at the text box — the app's main menu.
const MENU_KEYBOARD: readonly (readonly string[])[] = [
  ["💰 Balance", "📤 Send money"],
  ["🐷 Save", "🔁 Convert"],
  ["💳 Card", "📊 Spending"],
  ["💵 USD account", "❓ Help"],
];
// Each menu label maps to a phrase our intent handlers already understand.
const MENU_MAP: Record<string, string> = {
  "💰 balance": "check balance",
  "📤 send money": "send money",
  "🐷 save": "save",
  "🔁 convert": "convert",
  "💳 card": "create a card",
  "📊 spending": "where my money go",
  "💵 usd account": "open usd account",
  "❓ help": "help",
};

/** A dashboard-style greeting: current balance + quick actions. Shown on greetings
 * and on returning, so the user always lands on something useful. */
async function savingsTotalMinor(sessionId: string): Promise<number> {
  const events = await getStore().listEvents(sessionId);
  return events.filter((e) => e.kind === "savings").reduce((s, e) => s + (e.amountMinor ?? 0), 0);
}

async function sendDashboard(channel: Channel, sessionId: string, chatId: string): Promise<void> {
  let balLine = "—";
  let savedMinor = 0;
  try {
    const bal = await getMoneyProvider().getBalances({ sessionId });
    if (bal.ok && bal.data.length) balLine = bal.data.map((b) => formatMoney(b.available)).join("  ·  ");
    savedMinor = await savingsTotalMinor(sessionId);
  } catch {
    /* balance is best-effort on the dashboard */
  }
  const savedLine = savedMinor > 0 ? `🐷 <b>Savings:</b> ${formatMoney(money(savedMinor, "NGN"))}\n` : "";
  await channel.send({
    chatId,
    text:
      "👋 <b>Welcome to Kudi</b>\n\n" +
      `💰 <b>Balance:</b> ${balLine}\n${savedLine}\n` +
      "Wetin you wan do today? Tap a button below 👇, or just talk to me — by text or voice note.",
    keyboard: MENU_KEYBOARD,
  });
}

/**
 * App-lock: if a set-up user returns after being idle past SESSION_LOCK_MS (i.e.
 * they left the chat and came back), require the PIN before anything else. Updates
 * the last-seen stamp on every interaction. Returns true when it engaged the lock.
 */
async function maybeLock(channel: Channel, sessionId: string, chatId: string, state: Flow | null): Promise<boolean> {
  const store = getStore();
  const last = await store.getLastSeen(sessionId);
  await store.setLastSeen(sessionId, Date.now());
  if (state?.kind === "login_pin") return false; // the login_pin branch handles entry
  if (state?.kind) return false; // mid multi-step flow — don't interrupt
  if (!(await store.getPinHash(sessionId))) return false; // not set up yet
  if (last == null || Date.now() - last <= SESSION_LOCK_MS) return false;
  await store.setFlow(sessionId, { kind: "login_pin", tries: 0 });
  await channel.send({ chatId, text: "🔒 <b>Welcome back.</b> Enter your PIN to unlock Kudi." });
  return true;
}

/** Record the ₦25 platform fee for a completed money move. Reflected in balance. */
async function chargeFee(sessionId: string, reason: string): Promise<void> {
  await ev(sessionId, { kind: "fee", amountMinor: TXN_FEE_MINOR, currency: "NGN", detail: { reason } });
}

/** AI fraud check — warn (don't block) on unusually large transfers. */
function fraudLine(amountMinor: number): string {
  return amountMinor >= LARGE_TRANSFER_MINOR
    ? "⚠️ <b>Unusual transaction check:</b> this is larger than your usual transfers. Make sure you really want to send it.\n\n"
    : "";
}
const INJECTION = /ignore\s+(all|the|previous|your)\s+(instruction|rule)|send\s+.*\baccount\s+\d{6,}/i;
const QUICK_BUTTONS = [
  [{ label: "Check balance", data: "quick:balance", kind: "default" }, { label: "Create card", data: "quick:card", kind: "default" }],
  [{ label: "Send money", data: "quick:send", kind: "default" }, { label: "Save money", data: "quick:save", kind: "default" }],
] as const;

function sessionFor(chatId: string): string {
  return `tg:${chatId}`;
}

type TransferDraft = {
  amountMinor?: number;
  currency: "NGN" | "USD";
  accountNumber?: string;
  bank?: string;
  recipientName?: string;
};

/** Per-session conversational state for the PIN handshake and transfer details. Process-local. */
type Flow =
  | { kind: "set_pin"; pendingPin?: string }
  | { kind: "pin_for"; ref: string; tries: number }
  | { kind: "await_bank_transfer"; draft: TransferDraft }
  | { kind: "su_name" }
  | { kind: "su_email"; fullName: string }
  | { kind: "su_email_code"; fullName: string; email: string; code: string }
  | { kind: "su_phone"; fullName: string; email: string }
  | { kind: "su_dob"; fullName: string }
  | { kind: "su_bvn"; fullName: string; dob: string }
  | { kind: "kyc_selfie" }
  | { kind: "confirm_delete" }
  | { kind: "await_save_amount" }
  | { kind: "await_convert"; from: "NGN" | "USD"; to: "NGN" | "USD" }
  | { kind: "login_pin"; tries: number }
  | { kind: "reveal_card"; tries: number };

function code6(): string {
  return String(randomInt(100000, 1000000));
}

function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+234\d{10}$/.test(d)) return d;
  if (/^234\d{10}$/.test(d)) return `+${d}`;
  if (/^0\d{10}$/.test(d)) return `+234${d.slice(1)}`;
  if (/^[789]\d{9}$/.test(d)) return `+234${d}`; // 10 digits, no leading 0
  if (/^\+\d{11,15}$/.test(d)) return d;
  return null;
}
/** Persist a pending confirmation and return its short ref (for callback_data). */
async function stashConfirm(token: string, sessionId: string): Promise<string> {
  const ref = randomUUID().slice(0, 12);
  await getStore().putPending(ref, { token, sessionId, expiresAt: Date.now() + 100_000 });
  return ref;
}

async function ev(sessionId: string, event: KudiEvent): Promise<void> {
  try {
    await getStore().recordEvent(sessionId, event);
  } catch {
    /* analytics is best-effort */
  }
}

export async function handleMessage(channel: Channel, msg: IncomingMessage): Promise<void> {
  const sessionId = sessionFor(msg.chatId);
  const store = getStore();

  const gate = checkRateLimit(sessionId, "message");
  if (!gate.allowed) {
    await channel.send({ chatId: msg.chatId, text: "You dey go too fast. Wait small make we continue." });
    return;
  }
  let text = msg.text.trim();
  if (!text) {
    await channel.send({ chatId: msg.chatId, text: "Talk to me — check balance, make card, or send money." });
    return;
  }
  // A tap on the docked menu keyboard arrives as its label text → map to a command.
  const mapped = MENU_MAP[text.toLowerCase()];
  if (mapped) text = mapped;
  const lower = text.toLowerCase();
  void channel.sendTyping?.(msg.chatId); // "typing…" while we work (cosmetic, best-effort)

  const state = (await getStore().getFlow(sessionId)) as Flow | null;
  log("info", "msg.in", { sessionId, text: text.slice(0, 60), flow: state?.kind ?? "none", voice: msg.fromVoice });

  // App-lock: when locked, the only thing we accept is the PIN to unlock.
  if (state?.kind === "login_pin") {
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    if (!isValidPinFormat(text)) {
      await channel.send({ chatId: msg.chatId, text: "🔒 Enter your 4-digit PIN to unlock." });
      return;
    }
    const ph = await store.getPinHash(sessionId);
    if (!ph || !verifyPin(text, ph)) {
      const tries = (state.tries ?? 0) + 1;
      await ev(sessionId, { kind: "login_failed", flagged: true, detail: { tries } });
      await getStore().setFlow(sessionId, { kind: "login_pin", tries: tries >= 5 ? 0 : tries });
      await channel.send({ chatId: msg.chatId, text: "Wrong PIN. Try again." });
      return;
    }
    await getStore().setFlow(sessionId, null);
    await store.setLastSeen(sessionId, Date.now());
    await ev(sessionId, { kind: "login_success" });
    await channel.send({ chatId: msg.chatId, text: "🔓 Unlocked ✅" });
    await sendDashboard(channel, sessionId, msg.chatId);
    return;
  }
  // Reveal full card details — PIN-gated, like unlocking a card in a banking app.
  if (state?.kind === "reveal_card") {
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    if (lower === "cancel") {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "Okay, I no show am." });
      return;
    }
    if (!isValidPinFormat(text)) {
      await channel.send({ chatId: msg.chatId, text: "Enter your 4-digit PIN to reveal your card, or type cancel." });
      return;
    }
    const ph = await store.getPinHash(sessionId);
    if (!ph || !verifyPin(text, ph)) {
      const tries = state.tries + 1;
      await ev(sessionId, { kind: "pin_failed", flagged: true, detail: { tries, ctx: "reveal_card" } });
      if (tries >= 3) {
        await getStore().setFlow(sessionId, null);
        await channel.send({ chatId: msg.chatId, text: "Too many wrong PIN. Try again later." });
        return;
      }
      await getStore().setFlow(sessionId, { kind: "reveal_card", tries });
      await channel.send({ chatId: msg.chatId, text: "Wrong PIN. Try again, or type cancel." });
      return;
    }
    await getStore().setFlow(sessionId, null);
    const events = await store.listEvents(sessionId);
    const card = events.find((e) => e.kind === "card")?.detail as
      | { pan?: string; cvv?: string; exp?: string; brand?: string; currency?: string }
      | undefined;
    if (!card?.pan) {
      await channel.send({ chatId: msg.chatId, text: "I no fit find your card details. Try creating one." });
      return;
    }
    const num = String(card.pan).replace(/(.{4})/g, "$1 ").trim();
    await ev(sessionId, { kind: "card_revealed" });
    await channel.send({
      chatId: msg.chatId,
      text:
        `💳 <b>Your card details</b>\n\n` +
        `<code>${num}</code>\n` +
        `Expiry: <b>${card.exp}</b>   CVV: <b>${card.cvv}</b>\n` +
        `${String(card.brand ?? "visa").toUpperCase()} · ${card.currency ?? "NGN"}\n\n` +
        `<i>Keep these details private.</i>`,
    });
    return;
  }

  // Otherwise, engage the lock if they've been away.
  if (await maybeLock(channel, sessionId, msg.chatId, state)) return;

  // /start (Telegram sends this automatically on first open) → clean entry.
  if (lower === "/start" || lower === "/start@kudiai_bot") {
    await getStore().setFlow(sessionId, null);
    const pin0 = await store.getPinHash(sessionId);
    const acc0 = await store.getBmoniAccount(sessionId);
    if (pin0) {
      await sendDashboard(channel, sessionId, msg.chatId);
    } else if (!acc0) {
      await ev(sessionId, { kind: "onboarding_start" });
      await getStore().setFlow(sessionId, { kind: "su_name" });
      await channel.send({
        chatId: msg.chatId,
        text:
          "Welcome to Kudi 👋 I be your money assistant — you fit talk to me in English or Pidgin, by text or voice note.\n\n" +
          "💡 During setup: type <b>back</b> to change your last answer, or <b>cancel</b> to stop.\n\n" +
          "Let's open your account. First, wetin be your full name?",
      });
    } else {
      await getStore().setFlow(sessionId, { kind: "set_pin" });
      await channel.send({ chatId: msg.chatId, text: "Let's finish setting up — send a 4-digit PIN (I go ask you to confirm it)." });
    }
    return;
  }

  // A greeting or "new chat" feel → land on the dashboard (or route into setup).
  const isGreeting = /^(hi+|hello+|hey+|yo+|sup|good\s*(morning|afternoon|evening|day)|how far|how you dey|abeg|menu|dashboard|home|kudi|start)\b/i.test(
    lower,
  );
  if (isGreeting && !state?.kind) {
    if (await store.getPinHash(sessionId)) {
      await sendDashboard(channel, sessionId, msg.chatId);
      return;
    }
    if (!(await store.getBmoniAccount(sessionId))) {
      await ev(sessionId, { kind: "onboarding_start" });
      await getStore().setFlow(sessionId, { kind: "su_name" });
      await channel.send({
        chatId: msg.chatId,
        text:
          "Welcome to Kudi 👋 I be your money assistant — you fit talk to me in English or Pidgin, by text or voice note.\n\n" +
          "💡 During setup: type <b>back</b> to change your last answer, or <b>cancel</b> to stop.\n\n" +
          "Let's open your account. First, wetin be your full name?",
      });
      return;
    }
    await getStore().setFlow(sessionId, { kind: "set_pin" });
    await channel.send({ chatId: msg.chatId, text: "Let's finish setting up — send a 4-digit PIN (I go ask you to confirm it)." });
    return;
  }

  const startsTransferFlow = /^(send money|send|transfer money|transfer|pay money|pay)$/i.test(lower);
  if (startsTransferFlow && !state?.kind) {
    await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft: { currency: "NGN" } });
    await channel.send({ chatId: msg.chatId, text: "How much you wan send? Tell me the amount, for example 5k or 5000." });
    return;
  }

  if (state?.kind === "set_pin") {
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    if (lower === "cancel") {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "No wahala. Send me a 4-digit PIN anytime to set your PIN." });
      return;
    }

    const step = resolvePinSetup(text, state.pendingPin);
    if (!step.done) {
      await getStore().setFlow(sessionId, { kind: "set_pin", pendingPin: step.pendingPin });
      await channel.send({ chatId: msg.chatId, text: step.prompt });
      return;
    }

    await store.setPinHash(sessionId, hashPin(text));
    await getStore().setFlow(sessionId, null);
    await ev(sessionId, { kind: "pin_set" });
    await channel.send({
      chatId: msg.chatId,
      text:
        "PIN set ✅ You're all set!\n\n" +
        "Here's wetin I fit do for you:\n" +
        "💰 Check your balance\n" +
        "💳 Create a virtual card\n" +
        "📤 Send money to any bank\n" +
        "🐷 Save money\n" +
        "🪙 Receive crypto (USDC)\n\n" +
        "Just talk to me — by text or voice note — or tap a button below 👇",
      keyboard: MENU_KEYBOARD,
    });
    return;
  }

  if (state?.kind === "pin_for") {
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    if (lower === "cancel") {
      await getStore().setFlow(sessionId, null);
      await getStore().deletePending(state.ref);
      await channel.send({ chatId: msg.chatId, text: "Okay, I no send am." });
      return;
    }
    if (!isValidPinFormat(text)) {
      await channel.send({ chatId: msg.chatId, text: "Enter your 4-digit PIN to approve, or type cancel." });
      return;
    }
    const pinHash = await store.getPinHash(sessionId);
    if (!pinHash || !verifyPin(text, pinHash)) {
      const tries = state.tries + 1;
      await ev(sessionId, { kind: "pin_failed", flagged: true, detail: { tries } });
      if (tries >= 3) {
        await getStore().setFlow(sessionId, null);
        await getStore().deletePending(state.ref);
        await ev(sessionId, { kind: "pin_blocked", flagged: true });
        await channel.send({ chatId: msg.chatId, text: "Too many wrong PIN. I don cancel am for your safety." });
        return;
      }
      await getStore().setFlow(sessionId, { ...state, tries });
      await channel.send({ chatId: msg.chatId, text: "Wrong PIN. Try again, or type cancel." });
      return;
    }
    await getStore().setFlow(sessionId, null);
    await executeConfirmed(channel, sessionId, state.ref, msg.chatId);
    return;
  }

  if (state?.kind === "await_save_amount") {
    if (lower === "cancel") {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "Okay, no wahala.", buttons: QUICK_BUTTONS });
      return;
    }
    const amount = parseAmount(text, "NGN");
    if (!amount) {
      await channel.send({ chatId: msg.chatId, text: "Tell me a clear amount, e.g. 2k or 2000." });
      return;
    }
    await getStore().setFlow(sessionId, null);
    await doSave(channel, sessionId, msg.chatId, amount);
    return;
  }

  if (state?.kind === "await_convert") {
    if (lower === "cancel") {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "Okay, no wahala." });
      return;
    }
    const parsed = parseAmount(text, state.from);
    if (!parsed) {
      await channel.send({ chatId: msg.chatId, text: "Tell me a clear amount, e.g. 5000 or 5k." });
      return;
    }
    await getStore().setFlow(sessionId, null);
    await startConvert(channel, sessionId, msg.chatId, state.from, state.to, money(parsed.minor, state.from));
    return;
  }

  if (state?.kind === "confirm_delete") {
    if (text.trim().toUpperCase() === "DELETE") {
      await deleteAccount(sessionId);
      await getStore().setFlow(sessionId, null);
      await ev(sessionId, { kind: "account_closed", flagged: true });
      await channel.send({ chatId: msg.chatId, text: "Your account don close and your details deleted. Anytime you wan come back, just send hi. 👋" });
    } else {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "Okay, I no delete anything — your account dey safe.", buttons: QUICK_BUTTONS });
    }
    return;
  }

  // ── "back": step to the previous sign-up prompt to fix a mistake ─────
  if (state && lower === "back" && state.kind.startsWith("su_")) {
    switch (state.kind) {
      case "su_email":
        await getStore().setFlow(sessionId, { kind: "su_name" });
        await channel.send({ chatId: msg.chatId, text: "Okay — wetin be your full name?" });
        return;
      case "su_email_code":
        await getStore().setFlow(sessionId, { kind: "su_email", fullName: state.fullName });
        await channel.send({ chatId: msg.chatId, text: "Okay — send your email address again." });
        return;
      case "su_phone":
        await getStore().setFlow(sessionId, { kind: "su_email", fullName: state.fullName });
        await channel.send({ chatId: msg.chatId, text: "Okay — send your email address again." });
        return;
      case "su_bvn":
        await getStore().setFlow(sessionId, { kind: "su_dob", fullName: state.fullName });
        await channel.send({ chatId: msg.chatId, text: "Okay — send your date of birth again (YYYY-MM-DD)." });
        return;
      default:
        await channel.send({ chatId: msg.chatId, text: "This na the first step — just continue." });
        return;
    }
  }

  // ── Sign-up: collect details, then create the account with them ──────
  if (state?.kind === "su_name") {
    if (/^(hi+|hey+|hello+|start|\/start|menu|good\s?(morning|afternoon|evening)|how far)$/i.test(text.trim())) {
      await channel.send({ chatId: msg.chatId, text: "To open your account, tell me your full name (the name on your account)." });
      return;
    }
    if (text.trim().length < 2) {
      await channel.send({ chatId: msg.chatId, text: "Tell me your full name, e.g. Ada Okafor." });
      return;
    }
    await getStore().setFlow(sessionId, { kind: "su_email", fullName: text.trim() });
    await channel.send({ chatId: msg.chatId, text: "Nice to meet you. Wetin be your email address?" });
    return;
  }
  if (state?.kind === "su_email") {
    const email = text.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await channel.send({ chatId: msg.chatId, text: "Send a correct email, e.g. name@email.com." });
      return;
    }
    const c = code6();
    const sent = await sendVerificationEmail(email, state.fullName, c);
    if (sent) {
      await getStore().setFlow(sessionId, { kind: "su_email_code", fullName: state.fullName, email, code: c });
      await channel.send({ chatId: msg.chatId, text: `I don send a 6-digit code to <b>${email}</b>. Enter am here to confirm your email.` });
    } else {
      await getStore().setFlow(sessionId, { kind: "su_phone", fullName: state.fullName, email });
      await channel.send({ chatId: msg.chatId, text: "Now your phone number? e.g. 08012345678" });
    }
    return;
  }
  if (state?.kind === "su_email_code") {
    if (text.replace(/\D/g, "") !== state.code) {
      await channel.send({ chatId: msg.chatId, text: "That code no correct. Check your email and enter am again." });
      return;
    }
    await ev(sessionId, { kind: "email_verified" });
    await getStore().setFlow(sessionId, { kind: "su_phone", fullName: state.fullName, email: state.email });
    await channel.send({ chatId: msg.chatId, text: "Email confirmed ✅. Now your phone number? e.g. 08012345678" });
    return;
  }
  if (state?.kind === "su_phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      await channel.send({ chatId: msg.chatId, text: "Send a valid Nigerian number, e.g. 08012345678 or +2348012345678." });
      return;
    }
    await channel.send({ chatId: msg.chatId, text: "Creating your account…" });
    try {
      const acct = await createBmoniAccount(sessionId, { fullName: state.fullName, email: state.email, phone });
      await ev(sessionId, { kind: "account_created" });
      await getStore().setFlow(sessionId, { kind: "su_dob", fullName: state.fullName });
      await channel.send({
        chatId: msg.chatId,
        text:
          `✅ Account created for <b>${state.fullName}</b>.\n\n` +
          `Your wallet address:\n<code>${acct.walletAddress}</code>\n\n` +
          "Now to verify your identity — wetin be your date of birth? (YYYY-MM-DD)",
      });
    } catch (e) {
      log("error", "signup.create_failed", { sessionId, detail: String(e) });
      await ev(sessionId, { kind: "signup_error", flagged: true, detail: { error: String(e).slice(0, 400) } });
      await getStore().setFlow(sessionId, { kind: "su_phone", fullName: state.fullName, email: state.email });
      await channel.send({ chatId: msg.chatId, text: "Account creation get small wahala. Send your phone number make we try again." });
    }
    return;
  }
  if (state?.kind === "su_dob") {
    const dob = text.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      await channel.send({ chatId: msg.chatId, text: "Send your date of birth like 1995-06-20." });
      return;
    }
    await getStore().setFlow(sessionId, { kind: "su_bvn", fullName: state.fullName, dob });
    await channel.send({ chatId: msg.chatId, text: "Enter your 11-digit BVN to verify your identity." });
    return;
  }
  if (state?.kind === "su_bvn") {
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    const bvn = text.replace(/\D/g, "");
    if (bvn.length !== 11) {
      await channel.send({ chatId: msg.chatId, text: "Your BVN must be exactly 11 digits. Try again." });
      return;
    }
    await channel.send({ chatId: msg.chatId, text: "Checking your BVN…" });
    try {
      await submitKycProfile(sessionId, { fullName: state.fullName, dob: state.dob, bvn });
      await ev(sessionId, { kind: "kyc_profile_submitted" });
      await getStore().setFlow(sessionId, { kind: "kyc_selfie" });
      await channel.send({ chatId: msg.chatId, text: "Almost done. Send a selfie 🤳 — a clear photo of your face — so we know na really you." });
    } catch (e) {
      log("error", "kyc.profile_failed", { sessionId, detail: String(e) });
      await channel.send({ chatId: msg.chatId, text: "That BVN no verify. Check am and send again." });
    }
    return;
  }
  if (state?.kind === "kyc_selfie") {
    await channel.send({ chatId: msg.chatId, text: "Send a selfie photo 🤳 (tap the camera icon) to finish verification." });
    return;
  }

  if (state?.kind === "await_bank_transfer") {
    if (lower === "cancel" || /^(stop|cancel am|forget it|leave am|leave it|never ?mind|abeg stop)$/i.test(lower)) {
      await getStore().setFlow(sessionId, null);
      await channel.send({ chatId: msg.chatId, text: "Okay, I no go send am. Wetin else you wan do?", buttons: QUICK_BUTTONS });
      return;
    }

    const draft = preserveTransferDraft(state.draft, mergeTransferDraft(state.draft, text));
    const advanced =
      draft.amountMinor !== state.draft.amountMinor ||
      draft.accountNumber !== state.draft.accountNumber ||
      draft.bank !== state.draft.bank;
    const looksLikeDetail =
      /\d/.test(text) ||
      /bank|micro\s?finance|mfb|access|gt\s?b|guaranty|uba|zenith|first|kuda|opay|palm\s?pay|monie|wema|fidelity|union|fcmb|sterling|stanbic|polaris|keystone|ecobank|jaiz|providus|globus/i.test(lower);

    // Escape hatch: nothing new AND doesn't look like a transfer detail → the
    // user changed topic. Drop the flow and let the normal path handle it.
    if (!advanced && !looksLikeDetail) {
      await getStore().setFlow(sessionId, null);
    } else {
      if (!draft.amountMinor) {
        await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft });
        await channel.send({ chatId: msg.chatId, text: "How much you wan send? For example 5k or 5000. (Type cancel to stop.)" });
        return;
      }
      if (!draft.accountNumber) {
        await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft });
        await channel.send({ chatId: msg.chatId, text: "Send the 10-digit account number." });
        return;
      }
      if (!draft.bank) {
        await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft });
        await channel.send({ chatId: msg.chatId, text: "Which bank? e.g. Access Bank, GTBank, Opay, or Moniepoint MFB." });
        return;
      }

      // Have amount + account + bank → verify the account holder name via BMONI.
      const provider = getLiveMoneyProvider() ?? getMoneyProvider();
      const verification = await provider.verifyBankAccount(
        { sessionId },
        { accountNumber: draft.accountNumber, bankName: draft.bank },
      );
      if (!verification.ok) {
        await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft: { ...draft, bank: undefined } });
        await channel.send({ chatId: msg.chatId, text: `I couldn't check that account with "${draft.bank}". Send the bank name again, or type cancel.` });
        return;
      }

      const recipientName = verification.data.accountHolderName;
      const amount = money(draft.amountMinor, draft.currency);
      const beneficiaryId = `bank:${draft.bank}:${draft.accountNumber}:${recipientName}`;
      const { token } = createConfirmation({ sessionId, action: "transfer", amountMinor: amount.minor, currency: amount.currency, beneficiaryId, to: undefined });
      await getStore().setFlow(sessionId, null);
      const ref = await stashConfirm(token, sessionId);
      await getStore().setFlow(sessionId, { kind: "pin_for", ref, tries: 0 });
      await ev(sessionId, { kind: "transfer_prepared", amountMinor: amount.minor, currency: amount.currency, flagged: amount.minor >= LARGE_TRANSFER_MINOR, detail: { to: recipientName } });
      const slip = `Send <b>${formatMoney(amount)}</b> to <b>${recipientName}</b>\n${draft.bank} • ${draft.accountNumber}`;
      await channel.send({
        chatId: msg.chatId,
        text: `${slip}\n\n${fraudLine(amount.minor)}🔒 Enter your 4-digit PIN to approve, or type cancel.`,
        buttons: [[{ label: "Cancel", data: `cxl:${ref}`, kind: "cancel" }]],
      });
      return;
    }
  }

  const pinHash = await store.getPinHash(sessionId);
  if (!pinHash) {
    const account = await store.getBmoniAccount(sessionId);
    if (!account) {
      // Brand-new user → start sign-up. No account/wallet created yet, no buttons.
      await ev(sessionId, { kind: "onboarding_start" });
      await getStore().setFlow(sessionId, { kind: "su_name" });
      await channel.send({
        chatId: msg.chatId,
        text: "Welcome to Kudi 👋 I be your money assistant. Let's open your account — first, wetin be your full name?",
      });
      return;
    }
    // Account + KYC done but no PIN yet → set the transaction PIN.
    await getStore().setFlow(sessionId, { kind: "set_pin" });
    await channel.send({ chatId: msg.chatId, text: "Last step — set a 4-digit transfer PIN. Send me 4 digits (I go ask you to confirm it)." });
    return;
  }

  const parsed = parseTransferDraft(text);
  const transferIntent = /\b(send|transfer|pay|remit|credit)\b/i.test(text);
  // Don't treat a question/history ("how much did I send?") as a new transfer.
  const isQuestion = /^(how much|how far|did|does|do i|when|where|which|wetin|show|list|what)\b/i.test(text.trim());
  const isBankTransferRequest = transferIntent && !isQuestion;

  if (isBankTransferRequest) {
    await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft: { amountMinor: parsed.amountMinor, currency: "NGN", accountNumber: parsed.accountNumber, bank: parsed.bank?.displayName, recipientName: parsed.recipientName } });
    if (!parsed.amountMinor) {
      await channel.send({ chatId: msg.chatId, text: "How much you wan send? Tell me the amount, for example 5k or 5000." });
      return;
    }
    if (!parsed.accountNumber) {
      await channel.send({ chatId: msg.chatId, text: "I need the account number first. Send the account number and the bank name, for example: 0123456789 — UBA." });
      return;
    }
    if (!parsed.bank) {
      await channel.send({ chatId: msg.chatId, text: "I need the bank name too. Send the bank name, for example UBA, First Bank, or Accion Microfinance Bank." });
      return;
    }
    if (!parsed.recipientName) {
      await channel.send({ chatId: msg.chatId, text: "What name should I save for this receiver?" });
      return;
    }
    const amount = money(parsed.amountMinor, "NGN");
    const beneficiaryId = `bank:${parsed.bank.displayName}:${parsed.accountNumber}:${parsed.recipientName}`;
    const { token } = createConfirmation({
      sessionId,
      action: "transfer",
      amountMinor: amount.minor,
      currency: amount.currency,
      beneficiaryId,
      to: undefined,
    });
    const ref = await stashConfirm(token, sessionId);
    await getStore().setFlow(sessionId, { kind: "pin_for", ref, tries: 0 });
    const slip = `Send ${formatMoney(amount)} to ${parsed.recipientName} (${parsed.bank.displayName} • ${parsed.accountNumber})`;
    await channel.send({
      chatId: msg.chatId,
      text: `${slip}\n\n${fraudLine(amount.minor)}🔒 Enter your 4-digit PIN to approve, or type cancel.`,
      buttons: [[{ label: "Cancel", data: `cxl:${ref}`, kind: "cancel" }]],
    });
    return;
  }

  try {
    if (INJECTION.test(text)) await ev(sessionId, { kind: "injection_attempt", flagged: true, detail: { text } });
    log("info", "msg.in", { sessionId, voice: msg.fromVoice, text });

    const localReply = await tryHandleLocalIntent(channel, sessionId, msg.chatId, text);
    if (localReply) {
      await ev(sessionId, { kind: "message", detail: { voice: msg.fromVoice } });
      return;
    }

    const priorTurns = await store.loadTurns(sessionId);
    const result = await runAgent(sessionId, priorTurns, text);
    await store.saveTurns(sessionId, result.turns);
    log("info", "msg.out", { sessionId, reply: result.reply, confirm: result.confirm?.slip });
    await ev(sessionId, { kind: "message", detail: { voice: msg.fromVoice } });

    if (result.confirm) {
      const ref = await stashConfirm(result.confirm.token, sessionId);
      await getStore().setFlow(sessionId, { kind: "pin_for", ref, tries: 0 });
      const flagged = result.confirm.amountMinor >= LARGE_TRANSFER_MINOR;
      await ev(sessionId, {
        kind: `${result.confirm.action}_prepared`,
        amountMinor: result.confirm.amountMinor,
        currency: result.confirm.currency,
        flagged,
        detail: { slip: result.confirm.slip },
      });
      await channel.send({
        chatId: msg.chatId,
        text: `${result.reply || result.confirm.slip}\n\n${fraudLine(result.confirm.amountMinor)}🔒 Enter your 4-digit PIN to approve, or type cancel.`,
        buttons: [[{ label: "Cancel", data: `cxl:${ref}`, kind: "cancel" }]],
      });
      return;
    }
    await channel.send({ chatId: msg.chatId, text: result.reply });
  } catch (e) {
    log("error", "dispatch.message_failed", { sessionId, detail: String(e) });
    await channel.send({ chatId: msg.chatId, text: fallbackReply(text) });
  }
}

export async function handleCallback(
  channel: Channel,
  cb: { chatId: string; data: string; callbackId: string },
): Promise<void> {
  const sessionId = sessionFor(cb.chatId);
  const [kind, ref] = cb.data.split(":");
  await channel.answerCallback?.(cb.callbackId);
  if (kind === "cxl" && ref) {
    await getStore().setFlow(sessionId, null);
    await getStore().deletePending(ref);
    await channel.send({ chatId: cb.chatId, text: "Okay, I no go do am." });
    return;
  }
  if (kind === "reveal" && ref === "card") {
    await getStore().setFlow(sessionId, { kind: "reveal_card", tries: 0 });
    await channel.send({ chatId: cb.chatId, text: "🔒 Enter your 4-digit PIN to reveal your full card details." });
    return;
  }
  if (kind === "quick" && ref) {
    const actions: Record<string, string> = {
      balance: "check balance",
      card: "create a card",
      send: "send money",
      save: "save money",
    };
    const action = actions[ref];
    if (action) {
      await handleMessage(channel, {
        chatId: cb.chatId,
        userId: cb.chatId,
        text: action,
        fromVoice: false,
        messageId: cb.callbackId,
      });
    }
  }
}

/** Handle an incoming photo — used for the KYC selfie + ID document steps. */
export async function handlePhoto(
  channel: Channel,
  msg: { chatId: string; userId: string; messageId: string },
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const sessionId = sessionFor(msg.chatId);
  const state = (await getStore().getFlow(sessionId)) as Flow | null;
  void channel.sendTyping?.(msg.chatId);

  if (state?.kind === "kyc_selfie") {
    await channel.send({ chatId: msg.chatId, text: "Got your selfie — verifying your face… 🔍" });
    let uploaded = false;
    try {
      await uploadKycSelfie(sessionId, bytes, mime);
      uploaded = true;
      await ev(sessionId, { kind: "kyc_selfie_uploaded" });
    } catch (e) {
      log("error", "kyc.selfie_failed", { sessionId, detail: String(e) });
    }
    // Privacy: once the photo is saved/verified, remove it from the chat (like the PIN).
    await channel.deleteMessage?.(msg.chatId, msg.messageId);
    const { activated } = await finalizeKyc(sessionId);
    await ev(sessionId, { kind: "kyc_completed", detail: { activated, uploaded } });
    await getStore().setFlow(sessionId, { kind: "set_pin" });
    const line = activated
      ? "✅ Face verified — KYC approved!"
      : uploaded
        ? "✅ Face received — KYC submitted (review pending)."
        : "Hmm, that photo no clear. But we go continue for now.";
    await channel.send({ chatId: msg.chatId, text: `${line}\n\nLast step — set your 4-digit transfer PIN. Send me any 4 digits.` });
    return;
  }

  await channel.send({ chatId: msg.chatId, text: "Nice photo! But I no need am now. Wetin you wan do?", buttons: QUICK_BUTTONS });
}

function mergeTransferDraft(current: TransferDraft, text: string): TransferDraft {
  const parsed = parseTransferDraft(text);
  return {
    amountMinor: current.amountMinor ?? parsed.amountMinor,
    currency: current.currency,
    accountNumber: current.accountNumber ?? parsed.accountNumber,
    bank: current.bank ?? parsed.bank?.displayName,
    recipientName: current.recipientName ?? parsed.recipientName,
  };
}

function preserveTransferDraft(current: TransferDraft, next: TransferDraft): TransferDraft {
  return {
    amountMinor: next.amountMinor ?? current.amountMinor,
    currency: next.currency ?? current.currency,
    accountNumber: next.accountNumber ?? current.accountNumber,
    bank: next.bank ?? current.bank,
    recipientName: next.recipientName ?? current.recipientName,
  };
}

/** Execute a value-moving action after the user's PIN was verified. */
async function executeConfirmed(
  channel: Channel,
  sessionId: string,
  ref: string,
  chatId: string,
): Promise<void> {
  const entry = await getStore().getPending(ref);
  if (!entry || entry.expiresAt < Date.now()) {
    await channel.send({ chatId, text: "That confirmation don expire. Ask me again." });
    return;
  }
  await getStore().deletePending(ref);

  const payload = peekConfirmation(entry.token);
  if (!payload) {
    await channel.send({ chatId, text: "I no fit read that confirmation. Try am again." });
    return;
  }
  const verify = verifyConfirmation(entry.token, {
    sessionId,
    action: payload.action,
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    beneficiaryId: payload.beneficiaryId,
    to: payload.to,
  });
  if (!verify.ok) {
    await ev(sessionId, { kind: "confirm_rejected", flagged: true, detail: { reason: verify.reason } });
    await channel.send({
      chatId,
      text: verify.reason === "expired" ? "That confirmation don expire. Ask me again." : "I couldn't verify that. Nothing moved.",
    });
    return;
  }
  if (!(await getStore().consumeNonce(sessionId, payload.nonce))) {
    await channel.send({ chatId, text: "We don already do that one." });
    return;
  }
  if (!checkRateLimit(sessionId, "write").allowed) {
    await channel.send({ chatId, text: "Too many money moves right now. Wait small." });
    return;
  }

  const provider = getMoneyProvider();
  const amount = money(payload.amountMinor, payload.currency);
  try {
    if (payload.action === "transfer" && payload.beneficiaryId) {
      const res = await provider.transfer({ sessionId }, { amount, beneficiaryId: payload.beneficiaryId, idempotencyKey: payload.nonce });
      if (!res.ok) {
        await ev(sessionId, { kind: "transfer_failed", amountMinor: amount.minor, currency: amount.currency, detail: { code: res.error.code } });
        await channel.send({ chatId, text: res.error.userMessage });
        return;
      }
      await ev(sessionId, { kind: "transfer", amountMinor: amount.minor, currency: amount.currency, detail: { to: res.data.beneficiaryName, ref: res.data.id } });
      await chargeFee(sessionId, "transfer");
      const balAfter = money(Math.max(0, res.data.balanceAfter.minor - TXN_FEE_MINOR), "NGN");
      await recordOutcome(sessionId, `Sent ${formatMoney(res.data.amount)} to ${res.data.beneficiaryName}. Balance now ${formatMoney(balAfter)}.`);
      await channel.send({ chatId, text: transferReceipt({ ...res.data, balanceAfter: balAfter }) });
    } else if (payload.action === "convert" && payload.to) {
      const res = await provider.convert({ sessionId }, { amount, to: payload.to, idempotencyKey: payload.nonce });
      if (!res.ok) {
        await ev(sessionId, { kind: "convert_failed", amountMinor: amount.minor, currency: amount.currency, detail: { code: res.error.code } });
        await channel.send({ chatId, text: res.error.userMessage });
        return;
      }
      await ev(sessionId, {
        kind: "convert",
        amountMinor: amount.minor,
        currency: amount.currency,
        detail: {
          fromMinor: res.data.from.minor,
          fromCcy: res.data.from.currency,
          toMinor: res.data.to.minor,
          toCcy: res.data.to.currency,
        },
      });
      await chargeFee(sessionId, "convert");
      await recordOutcome(sessionId, `Converted ${formatMoney(res.data.from)} to ${formatMoney(res.data.to)}.`);
      await channel.send({ chatId, text: conversionReceipt(res.data) });
    }
  } catch (e) {
    log("error", "confirm.execute_failed", { sessionId, detail: String(e) });
    await channel.send({ chatId, text: "The money service no respond. Nothing moved — try again." });
  }
}

function refOf(id: string): string {
  return `KUDI-${id.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase()}`;
}
function whenOf(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
function transferReceipt(r: { id: string; amount: Money; beneficiaryName: string; balanceAfter: Money; createdAt: string }): string {
  return [
    "✅ <b>Transfer Successful</b>",
    "",
    `<b>${formatMoney(r.amount)}</b> sent to <b>${r.beneficiaryName}</b>`,
    `Ref: <code>${refOf(r.id)}</code>`,
    `Date: ${whenOf(r.createdAt)}`,
    "Status: Completed",
    "Fee: ₦25",
    `New balance: ${formatMoney(r.balanceAfter)}`,
    "",
    "<i>Kudi · Proof of payment</i>",
  ].join("\n");
}
function conversionReceipt(r: { id: string; from: Money; to: Money; rateDisplay: string; createdAt: string }): string {
  return [
    "✅ <b>Conversion Successful</b>",
    "",
    `<b>${formatMoney(r.from)}</b> → <b>${formatMoney(r.to)}</b>`,
    `Rate: ${r.rateDisplay}`,
    `Ref: <code>${refOf(r.id)}</code>`,
    `Date: ${whenOf(r.createdAt)}`,
    "Fee: ₦25",
    "",
    "<i>Kudi · Proof of payment</i>",
  ].join("\n");
}

function fallbackReply(text: string): string {
  const lower = text.toLowerCase();
  if (/balance|bal/i.test(lower)) return "I fit check your balance. Tell me if you want NGN or USD.";
  if (/card|virtual/i.test(lower)) return "I fit create a card for you. Tell me the label and currency.";
  if (/save|savings/i.test(lower)) return "I fit help you save. Tell me the amount.";
  if (/send|transfer|pay/i.test(lower)) return "I fit help with a transfer. Send the amount and the account details first.";
  return "I dey here. Tell me wetin you wan do — check balance, make card, or send money.";
}

async function doSave(channel: Channel, sessionId: string, chatId: string, amount: Money): Promise<void> {
  const res = await getMoneyProvider().saveToSavings(
    { sessionId },
    { amount, cadence: "once", idempotencyKey: randomUUID() },
  );
  if (!res.ok) {
    await channel.send({ chatId, text: res.error.userMessage });
    return;
  }
  await ev(sessionId, { kind: "savings", amountMinor: amount.minor, currency: amount.currency });
  await chargeFee(sessionId, "savings");
  await channel.send({ chatId, text: `🐷 Saved ${formatMoney(res.data.savedNow)} ✅\n<i>Fee: ₦25</i>` });
}

/** Validate funds then put a conversion behind the PIN gate. Shared by the
 * one-shot ("change 10k to dollar") and two-step (tap Convert → type amount) paths. */
async function startConvert(
  channel: Channel,
  sessionId: string,
  chatId: string,
  from: "NGN" | "USD",
  to: "NGN" | "USD",
  amount: Money,
): Promise<void> {
  const bal = await getMoneyProvider().getBalances({ sessionId });
  const avail = bal.ok ? (bal.data.find((b) => b.currency === from)?.available.minor ?? 0) : 0;
  if (avail < amount.minor) {
    await channel.send({ chatId, text: `You no get enough ${from} to convert. You get ${formatMoney(money(avail, from))}.` });
    return;
  }
  const { token } = createConfirmation({ sessionId, action: "convert", amountMinor: amount.minor, currency: from, to });
  const ref = await stashConfirm(token, sessionId);
  await getStore().setFlow(sessionId, { kind: "pin_for", ref, tries: 0 });
  await channel.send({
    chatId,
    text: `Change ${formatMoney(amount)} to ${to}\n\n🔒 Enter your 4-digit PIN to approve, or type cancel.`,
    buttons: [[{ label: "Cancel", data: `cxl:${ref}`, kind: "cancel" }]],
  });
}

async function tryHandleLocalIntent(channel: Channel, sessionId: string, chatId: string, text: string): Promise<boolean> {
  const lower = text.toLowerCase();
  const provider = getMoneyProvider();

  if (/^(help|menu|options)\b|what can you do|wetin you fit do|how (do|does|to) (i|this|it)/i.test(lower)) {
    await channel.send({
      chatId,
      text:
        "Here's how to use Kudi 👇\n\n" +
        "💰 <b>Balance</b> — “how much I get?”\n" +
        "📤 <b>Send</b> — “send 5k”, then I ask for the account number + bank\n" +
        "🐷 <b>Save</b> — “save 2k” · see it with “my savings”\n" +
        "💵 <b>USD account</b> — “open USD account” (₦500)\n" +
        "🔁 <b>Convert</b> — “change 10k to dollar”\n" +
        "📊 <b>Spending</b> — “where my money go?”\n" +
        "💡 <b>Advice</b> — “can I afford 20k this week?”\n" +
        "💳 <b>Card</b> — “create a card” (₦200)\n" +
        "🪙 <b>Receive crypto</b> — “my wallet address”\n\n" +
        "🛡️ I automatically flag unusual transfers, and every transfer needs your PIN. A small ₦25 fee applies per transaction.\n\n" +
        "You fit talk by text or voice note. Type <b>delete account</b> to close your account.",
      keyboard: MENU_KEYBOARD,
    });
    return true;
  }

  if (
    !/\b(go|went|spend|spending|breakdown|save|savings)\b/i.test(lower) &&
    /\bbalance\b|\bbal\b|how much (i|we|dey|money|remain)|how much i get|wetin dey (my |the )?account|wetin i get|wetin dey inside|my money|how far (my )?account|check.*(balance|account)|money wey dey/i.test(
      lower,
    )
  ) {
    const res = await provider.getBalances({ sessionId });
    if (!res.ok) {
      await channel.send({ chatId, text: res.error.userMessage });
      return true;
    }
    const lines = res.data.map((b) => `${b.currency === "USD" ? "💵 USD" : "₦ NGN"}: ${formatMoney(b.available)}`).join("\n");
    await channel.send({ chatId, text: `💰 <b>Your balance</b>\n${lines}` });
    return true;
  }

  if (/card|virtual/i.test(lower)) {
    const events = await getStore().listEvents(sessionId);
    const existing = events.find((e) => e.kind === "card");
    if (existing) {
      const d = existing.detail ?? {};
      await channel.send({
        chatId,
        text:
          `💳 <b>Your card</b>\n\n` +
          `${String(d.brand ?? "visa").toUpperCase()} •••• ${d.last4 ?? "****"}\n` +
          `Expiry: <b>${d.exp ?? ""}</b> · ${d.currency ?? "NGN"}\n\n` +
          `Tap below to see the full number, then enter your PIN.`,
        buttons: [[{ label: "🔓 Reveal full details", data: "reveal:card", kind: "default" }]],
      });
      return true;
    }
    const bal = await provider.getBalances({ sessionId });
    const ngnMinor = bal.ok ? (bal.data.find((b) => b.currency === "NGN")?.available.minor ?? 0) : 0;
    if (ngnMinor < CARD_FEE_MINOR) {
      await channel.send({
        chatId,
        text: `Creating a card cost ₦200, but your balance na ${formatMoney(money(ngnMinor, "NGN"))}. Fund your wallet first.`,
      });
      return true;
    }
    const res = await provider.createVirtualCard({ sessionId }, { currency: "NGN", label: "Kudi card" });
    if (!res.ok) {
      await channel.send({ chatId, text: res.error.userMessage });
      return true;
    }
    const c = res.data;
    const exp = `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).padStart(2, "0")}`;
    await ev(sessionId, { kind: "card_fee", amountMinor: CARD_FEE_MINOR, currency: "NGN", detail: { reason: "card_creation" } });
    await ev(sessionId, { kind: "card", detail: { last4: c.last4, exp, brand: c.brand, currency: c.currency, label: c.label, pan: c.pan, cvv: c.cvv } });
    const num = c.pan.replace(/(.{4})/g, "$1 ").trim();
    await channel.send({
      chatId,
      text:
        `💳 <b>Your virtual card is ready</b>\n\n` +
        `<code>${num}</code>\n` +
        `Expiry: <b>${exp}</b>   CVV: <b>${c.cvv}</b>\n` +
        `${c.brand.toUpperCase()} · ${c.currency}\n\n` +
        `<i>Card fee: ₦200 charged.</i>\n` +
        `Keep these details private.`,
    });
    return true;
  }

  if (/receive|deposit|crypto|usdc|wallet address|my address|fund/i.test(lower)) {
    try {
      const r = await getReceiveAddress(sessionId);
      await channel.send({
        chatId,
        text:
          `Your Kudi wallet address:\n<code>${r.walletAddress}</code>\n\n` +
          (r.address
            ? `To receive USDC (Base network), send to:\n<code>${r.address}</code>`
            : "Your crypto deposit address dey come up shortly."),
      });
    } catch {
      await channel.send({ chatId, text: "I couldn't fetch your deposit address just now. Try again." });
    }
    return true;
  }

  if (/delete.*account|close.*account|remove my account|delete my account/i.test(lower)) {
    await getStore().setFlow(sessionId, { kind: "confirm_delete" });
    await channel.send({ chatId, text: "You wan close your account? This go delete all your details. Reply <b>DELETE</b> to confirm, or anything else to cancel." });
    return true;
  }

  if (/(open|create|get|want|need).*(usd|dollar).*(account|wallet)|(usd|dollar)\s+(account|wallet)/i.test(lower)) {
    const events = await getStore().listEvents(sessionId);
    if (events.some((e) => e.kind === "usd_account")) {
      const bal = await provider.getBalances({ sessionId });
      const usd = bal.ok ? (bal.data.find((b) => b.currency === "USD")?.available.minor ?? 0) : 0;
      let cryptoLine = "";
      try {
        const r = await getReceiveAddress(sessionId);
        if (r.address) cryptoLine = `\n🪙 Or receive USDC (Base network):\n<code>${r.address}</code>`;
      } catch {
        /* deposit address is best-effort */
      }
      await channel.send({
        chatId,
        text:
          "💵 <b>Your USD account</b>\n\n" +
          `Balance: <b>${formatMoney(money(usd, "USD"))}</b>\n\n` +
          "<b>How to add dollars:</b>\n" +
          "🔁 Convert naira — say “change 10k to dollar”" +
          cryptoLine,
      });
      return true;
    }
    if (!events.some((e) => e.kind === "kyc_completed" || e.kind === "account_created")) {
      await channel.send({ chatId, text: "To open a USD account you need to verify your identity first. Type /start to complete verification." });
      return true;
    }
    const bal = await provider.getBalances({ sessionId });
    const ngnMinor = bal.ok ? (bal.data.find((b) => b.currency === "NGN")?.available.minor ?? 0) : 0;
    if (ngnMinor < USD_ACCOUNT_FEE_MINOR) {
      await channel.send({
        chatId,
        text: `Opening a USD account cost ₦500, but your balance na ${formatMoney(money(ngnMinor, "NGN"))}. Fund your wallet first.`,
      });
      return true;
    }
    await ev(sessionId, { kind: "usd_account_fee", amountMinor: USD_ACCOUNT_FEE_MINOR, currency: "NGN", detail: { reason: "usd_account" } });
    await ev(sessionId, { kind: "usd_account" });
    await channel.send({
      chatId,
      text:
        "✅ <b>USD account opened</b>\n\n" +
        "You fit now hold and receive dollars. <i>₦500 charged.</i>\n" +
        "Say “change 10k to dollar” to fund it.",
    });
    return true;
  }

  if (/\bconvert\b|\bexchange\b|\bswap\b|change\s+.*(to|into)\s*(dollar|usd|naira|ngn|\$)/i.test(lower)) {
    // Direction from the target ("to naira" → USD→NGN); default is NGN→USD.
    const targetNaira = /to\s*(naira|ngn|₦)/i.test(lower);
    const from: "NGN" | "USD" = targetNaira ? "USD" : "NGN";
    const to: "NGN" | "USD" = targetNaira ? "NGN" : "USD";
    if (to === "USD") {
      const events = await getStore().listEvents(sessionId);
      if (!events.some((e) => e.kind === "usd_account")) {
        await channel.send({
          chatId,
          text: "To hold dollars you need a USD account. Opening one cost ₦500 — just say “open USD account” to set am up.",
        });
        return true;
      }
    }
    const parsed = parseAmount(text, from);
    if (!parsed) {
      await getStore().setFlow(sessionId, { kind: "await_convert", from, to });
      await channel.send({
        chatId,
        text:
          from === "NGN"
            ? "How much naira you wan change to dollars? Just type the amount, e.g. 5000 or 5k."
            : "How much dollars you wan change to naira? e.g. 10 or $10.",
      });
      return true;
    }
    await startConvert(channel, sessionId, chatId, from, to, money(parsed.minor, from));
    return true;
  }

  if (/where.*(my )?money.*(go|went)|how.*(i|we|dey|you).*spend|my spending|\bspending\b|breakdown/i.test(lower)) {
    const events = await getStore().listEvents(sessionId);
    const spend = events.filter((e) => e.kind === "transfer" || e.kind === "savings");
    if (spend.length === 0) {
      await channel.send({ chatId, text: "You never send or save money yet — once you start, I go break am down for you 📊" });
      return true;
    }
    const byCat: Record<string, number> = {};
    for (const e of spend) {
      const cat = e.kind === "savings" ? "Savings" : typeof e.detail?.to === "string" ? String(e.detail.to) : "Transfers";
      byCat[cat] = (byCat[cat] ?? 0) + (e.amountMinor ?? 0);
    }
    const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
    const lines = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([c, m]) => `• ${c}: ${formatMoney(money(m, "NGN"))} (${Math.round((m / total) * 100)}%)`);
    await channel.send({ chatId, text: `📊 <b>Where your money went</b>\n${lines.join("\n")}\n\nTotal: ${formatMoney(money(total, "NGN"))}` });
    return true;
  }

  // Viewing savings (no amount to save) → show the savings pot.
  if (
    !parseAmount(text, "NGN") &&
    /(my savings|savings balance|how (much|far).*(save|saving)|see .*saving|check .*saving|wetin.*save|show .*saving)/i.test(lower)
  ) {
    const saved = await savingsTotalMinor(sessionId);
    await channel.send({
      chatId,
      text:
        `🐷 <b>Your savings</b>\n\n` +
        `You don save <b>${formatMoney(money(saved, "NGN"))}</b> so far.\n\n` +
        (saved > 0 ? "Say “save 2k” to add more." : "Say “save 2k” to start saving."),
    });
    return true;
  }

  if (/save|savings/i.test(lower)) {
    const amount = parseAmount(text, "NGN");
    if (!amount) {
      await getStore().setFlow(sessionId, { kind: "await_save_amount" });
      await channel.send({ chatId, text: "How much you wan save? Tell me the amount, e.g. 2k or 2000." });
      return true;
    }
    await doSave(channel, sessionId, chatId, amount);
    return true;
  }

  if (/send|transfer|pay/i.test(lower)) {
    await getStore().setFlow(sessionId, { kind: "await_bank_transfer", draft: { currency: "NGN" } });
    await channel.send({ chatId, text: "How much you wan send? Tell me the amount, for example 5k or 5000." });
    return true;
  }

  return false;
}

async function recordOutcome(sessionId: string, note: string): Promise<void> {
  const store = getStore();
  const turns = await store.loadTurns(sessionId);
  await store.saveTurns(sessionId, [...turns, { role: "assistant", text: note }]);
}
