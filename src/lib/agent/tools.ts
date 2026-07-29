import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getMoneyProvider, type MoneyProvider } from "@/lib/bmoni";
import { resolveBeneficiary } from "@/lib/bmoni/resolve";
import { formatMoney } from "@/lib/money/format";
import { parseAmount } from "@/lib/money/parse";
import { type Currency, money } from "@/lib/money/types";
import { createConfirmation } from "./confirm";
import type { ToolSpec } from "./llm";

/**
 * Tool layer. Note the security shape: the LLM can call read/low-risk tools and
 * `prepare_transfer` / `prepare_conversion` (which only PREVIEW and mint a
 * confirmation token). It CANNOT call send_money or convert directly — those run
 * server-side after the user taps confirm. So a hallucination or prompt
 * injection cannot move money.
 */

export interface ToolContext {
  readonly sessionId: string;
  readonly chaos?: boolean;
}

/** A value-moving action awaiting the user's physical confirmation. */
export interface PendingConfirm {
  readonly action: "transfer" | "convert";
  readonly token: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly to?: Currency;
  readonly beneficiaryId?: string;
  readonly beneficiaryName?: string;
  readonly slip: string;
}

/** Structured UI hint for rich channels (web). Telegram mostly uses text. */
export type UiEvent =
  | { readonly kind: "balance"; readonly lines: { currency: Currency; text: string }[] }
  | { readonly kind: "card"; readonly last4: string; readonly brand: string; readonly label: string; readonly exp: string }
  | { readonly kind: "saved"; readonly text: string };

export interface ToolExecResult {
  /** JSON handed back to the LLM as the tool result. Never contains PAN/token. */
  readonly modelResult: unknown;
  readonly confirm?: PendingConfirm;
  readonly ui?: UiEvent;
}

const CURRENCY = z.enum(["NGN", "USD"]);

const schemas = {
  get_balance: z.object({ currency: CURRENCY.optional() }),
  create_card: z.object({ currency: CURRENCY, label: z.string().min(1).max(40) }),
  prepare_transfer: z.object({
    amount: z.string().min(1),
    currency: CURRENCY.optional(),
    recipient: z.string().min(1),
  }),
  set_savings: z.object({
    amount: z.string().min(1),
    currency: CURRENCY.optional(),
    cadence: z.enum(["once", "daily", "weekly"]),
  }),
  prepare_conversion: z.object({
    amount: z.string().min(1),
    from: CURRENCY,
    to: CURRENCY,
  }),
};

export type ToolName = keyof typeof schemas;

/** JSON-Schema tool specs given to the LLM (hand-written to avoid a codegen dep). */
export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "get_balance",
    description: "Read the user's wallet balance. Optionally limit to one currency.",
    parameters: {
      type: "object",
      properties: { currency: { type: "string", enum: ["NGN", "USD"] } },
    },
  },
  {
    name: "create_card",
    description: "Issue a virtual card. Needs a currency and a short label like 'Netflix'.",
    parameters: {
      type: "object",
      properties: {
        currency: { type: "string", enum: ["NGN", "USD"] },
        label: { type: "string", description: "Short purpose label" },
      },
      required: ["currency", "label"],
    },
  },
  {
    name: "prepare_transfer",
    description:
      "Preview a money transfer and show the user a confirmation slip. Pass the amount as the user said it (e.g. '5k'), and the recipient in the user's own words (e.g. 'my brother'). Does NOT send — the user confirms on screen.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "string", description: "Amount as spoken, e.g. '5k' or '5000'" },
        currency: { type: "string", enum: ["NGN", "USD"] },
        recipient: { type: "string", description: "Recipient in the user's words" },
      },
      required: ["amount", "recipient"],
    },
  },
  {
    name: "set_savings",
    description: "Record a savings rule and save the amount once now. Recurrence is not active.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "string" },
        currency: { type: "string", enum: ["NGN", "USD"] },
        cadence: { type: "string", enum: ["once", "daily", "weekly"] },
      },
      required: ["amount", "cadence"],
    },
  },
  {
    name: "prepare_conversion",
    description:
      "Preview a currency conversion and show a confirmation slip. Does NOT convert — the user confirms on screen.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "string" },
        from: { type: "string", enum: ["NGN", "USD"] },
        to: { type: "string", enum: ["NGN", "USD"] },
      },
      required: ["amount", "from", "to"],
    },
  },
];

export async function executeTool(
  ctx: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<ToolExecResult> {
  const provider = getMoneyProvider();
  switch (name) {
    case "get_balance":
      return getBalance(ctx, provider, schemas.get_balance.parse(rawArgs ?? {}));
    case "create_card":
      return createCard(ctx, provider, schemas.create_card.parse(rawArgs));
    case "prepare_transfer":
      return prepareTransfer(ctx, provider, schemas.prepare_transfer.parse(rawArgs));
    case "set_savings":
      return setSavings(ctx, provider, schemas.set_savings.parse(rawArgs));
    case "prepare_conversion":
      return prepareConversion(ctx, schemas.prepare_conversion.parse(rawArgs));
    default:
      return { modelResult: { error: "unknown_tool", tool: name } };
  }
}

async function getBalance(
  ctx: ToolContext,
  provider: MoneyProvider,
  args: z.infer<typeof schemas.get_balance>,
): Promise<ToolExecResult> {
  const res = await provider.getBalances({ sessionId: ctx.sessionId, chaos: ctx.chaos });
  if (!res.ok) return { modelResult: { error: res.error.code, message: res.error.userMessage } };
  const filtered = args.currency ? res.data.filter((b) => b.currency === args.currency) : res.data;
  const lines = filtered.map((b) => ({ currency: b.currency, text: formatMoney(b.available) }));
  return {
    modelResult: { balances: lines.map((l) => `${l.currency} ${l.text}`) },
    ui: { kind: "balance", lines },
  };
}

async function createCard(
  ctx: ToolContext,
  provider: MoneyProvider,
  args: z.infer<typeof schemas.create_card>,
): Promise<ToolExecResult> {
  const res = await provider.createVirtualCard(
    { sessionId: ctx.sessionId, chaos: ctx.chaos },
    { currency: args.currency, label: args.label },
  );
  if (!res.ok) return { modelResult: { error: res.error.code, message: res.error.userMessage } };
  const c = res.data;
  const exp = `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).padStart(2, "0")}`;
  // NEVER return the full PAN to the model or persist it — last4 only (§8).
  return {
    modelResult: { last4: c.last4, brand: c.brand, label: c.label, currency: c.currency, exp },
    ui: { kind: "card", last4: c.last4, brand: c.brand, label: c.label, exp },
  };
}

async function prepareTransfer(
  ctx: ToolContext,
  provider: MoneyProvider,
  args: z.infer<typeof schemas.prepare_transfer>,
): Promise<ToolExecResult> {
  const currency: Currency = args.currency ?? "NGN";
  const amount = parseAmount(args.amount, currency);
  if (!amount) return { modelResult: { error: "amount_unclear", ask: "How much exactly?" } };

  const list = await provider.listBeneficiaries({ sessionId: ctx.sessionId, chaos: ctx.chaos });
  if (!list.ok) return { modelResult: { error: list.error.code, message: list.error.userMessage } };
  const resolved = resolveBeneficiary(args.recipient, list.data);
  if (resolved.kind === "unknown") {
    return { modelResult: { error: "unknown_recipient", recipient: args.recipient } };
  }
  if (resolved.kind === "ambiguous") {
    return {
      modelResult: { error: "ambiguous_recipient", candidates: resolved.candidates.map((b) => b.name) },
    };
  }

  const balRes = await provider.getBalances({ sessionId: ctx.sessionId });
  const bal = balRes.ok ? balRes.data.find((b) => b.currency === currency) : undefined;
  if (bal && bal.available.minor < amount.minor) {
    return {
      modelResult: { error: "insufficient_funds", balance: formatMoney(bal.available) },
    };
  }

  const { token } = createConfirmation({
    sessionId: ctx.sessionId,
    action: "transfer",
    amountMinor: amount.minor,
    currency,
    beneficiaryId: resolved.beneficiary.id,
    to: undefined,
  });
  const slip = `Send ${formatMoney(amount)} to ${resolved.beneficiary.name}`;
  return {
    modelResult: { ok: true, amount: formatMoney(amount), recipient: resolved.beneficiary.name },
    confirm: {
      action: "transfer",
      token,
      amountMinor: amount.minor,
      currency,
      beneficiaryId: resolved.beneficiary.id,
      beneficiaryName: resolved.beneficiary.name,
      slip,
    },
  };
}

async function setSavings(
  ctx: ToolContext,
  provider: MoneyProvider,
  args: z.infer<typeof schemas.set_savings>,
): Promise<ToolExecResult> {
  const currency: Currency = args.currency ?? "NGN";
  const amount = parseAmount(args.amount, currency);
  if (!amount) return { modelResult: { error: "amount_unclear", ask: "How much do you want to save?" } };
  const res = await provider.saveToSavings(
    { sessionId: ctx.sessionId, chaos: ctx.chaos },
    { amount, cadence: args.cadence, idempotencyKey: randomUUID() },
  );
  if (!res.ok) return { modelResult: { error: res.error.code, message: res.error.userMessage } };
  return {
    modelResult: {
      saved: formatMoney(res.data.savedNow),
      cadence: res.data.cadence,
      recurring: false,
      note: "Saved once now. Recurring saving is not active in this build.",
    },
    ui: { kind: "saved", text: `Saved ${formatMoney(res.data.savedNow)}` },
  };
}

async function prepareConversion(
  ctx: ToolContext,
  args: z.infer<typeof schemas.prepare_conversion>,
): Promise<ToolExecResult> {
  if (args.from === args.to) {
    return { modelResult: { error: "same_currency" } };
  }
  const amount = parseAmount(args.amount, args.from);
  if (!amount) return { modelResult: { error: "amount_unclear", ask: "How much do you want to change?" } };
  const { token } = createConfirmation({
    sessionId: ctx.sessionId,
    action: "convert",
    amountMinor: amount.minor,
    currency: args.from,
    to: args.to,
    beneficiaryId: undefined,
  });
  const slip = `Change ${formatMoney(money(amount.minor, args.from))} to ${args.to}`;
  return {
    modelResult: { ok: true, amount: formatMoney(money(amount.minor, args.from)), to: args.to },
    confirm: {
      action: "convert",
      token,
      amountMinor: amount.minor,
      currency: args.from,
      to: args.to,
      slip,
    },
  };
}
