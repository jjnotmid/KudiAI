import { parseAmount } from "@/lib/money/parse";
import type { Currency } from "@/lib/money/types";

export interface BankMatch {
  readonly displayName: string;
  readonly aliases: readonly string[];
}

export interface BankTransferDraft {
  readonly amountMinor?: number;
  readonly currency: Currency;
  readonly accountNumber?: string;
  readonly bank?: BankMatch;
  readonly recipientName?: string;
  readonly amountText?: string;
}

const BANKS: readonly BankMatch[] = [
  { displayName: "Access Bank", aliases: ["access", "access bank", "accessbank"] },
  { displayName: "First Bank", aliases: ["first bank", "firstbank", "first bank of nigeria"] },
  { displayName: "FCMB", aliases: ["fcmb", "first city monument bank"] },
  { displayName: "Fidelity Bank", aliases: ["fidelity", "fidelity bank"] },
  { displayName: "GTBank", aliases: ["gtb", "gtbank", "guaranty trust bank", "guaranty trust"] },
  { displayName: "UBA", aliases: ["uba", "united bank for africa"] },
  { displayName: "Zenith Bank", aliases: ["zenith", "zenith bank"] },
  { displayName: "Union Bank", aliases: ["union", "union bank"] },
  { displayName: "Sterling Bank", aliases: ["sterling", "sterling bank"] },
  { displayName: "Unity Bank", aliases: ["unity", "unity bank"] },
  { displayName: "Wema Bank", aliases: ["wema", "wema bank"] },
  { displayName: "Keystone Bank", aliases: ["keystone", "keystone bank"] },
  { displayName: "Polaris Bank", aliases: ["polaris", "polaris bank"] },
  { displayName: "Providus Bank", aliases: ["providus", "providus bank"] },
  { displayName: "Stanbic IBTC", aliases: ["stanbic", "stanbic ibtc", "stanbic ibtc bank"] },
  { displayName: "Standard Chartered", aliases: ["standard chartered", "scb"] },
  { displayName: "Jaiz Bank", aliases: ["jaiz", "jaiz bank"] },
  { displayName: "Taj Bank", aliases: ["taj", "taj bank"] },
  { displayName: "Lotus Bank", aliases: ["lotus", "lotus bank"] },
  { displayName: "Suntrust Bank", aliases: ["suntrust", "suntrust bank"] },
  { displayName: "Opay Bank", aliases: ["opay", "opay bank", "opay nigeria"] },
  { displayName: "Kuda Bank", aliases: ["kuda", "kuda bank"] },
  { displayName: "Rubies Bank", aliases: ["rubies", "rubies bank"] },
  { displayName: "FSDH Merchant Bank", aliases: ["fsdh", "fsdh merchant bank"] },
  { displayName: "AB Microfinance Bank", aliases: ["ab microfinance", "ab mfb", "abmfb"] },
  { displayName: "Accion Microfinance Bank", aliases: ["accion", "accion microfinance", "accion mfb"] },
  { displayName: "Addosser Microfinance Bank", aliases: ["addosser", "addosser mfb", "addosser microfinance"] },
  { displayName: "Advans La Fayette Microfinance Bank", aliases: ["advans", "advans la fayette", "advans lafayette"] },
  { displayName: "Apeks Microfinance Bank", aliases: ["apeks", "apeks mfb"] },
  { displayName: "Boctrust Microfinance Bank", aliases: ["boctrust", "boctrust mfb"] },
  { displayName: "Fina Bank", aliases: ["fina", "fina bank"] },
  { displayName: "PAGA Microfinance Bank", aliases: ["paga", "paga mfb"] },
  { displayName: "Shepherd Trust Microfinance Bank", aliases: ["shepherd", "shepherd trust", "shepherd mfb"] },
  { displayName: "VFD Microfinance Bank", aliases: ["vfd", "vfd microfinance", "vfd bank"] },
  { displayName: "NIRSAL Microfinance Bank", aliases: ["nirsal", "nirsal microfinance"] },
];

export function findBank(query: string): BankMatch | null {
  const norm = normalise(query);
  if (!norm) return null;
  for (const bank of BANKS) {
    const aliases = [bank.displayName, ...bank.aliases];
    const hit = aliases.some((alias) => normalise(alias) === norm || norm.includes(normalise(alias)) || normalise(alias).includes(norm));
    if (hit) return bank;
  }
  return null;
}

export function parseTransferDraft(text: string): BankTransferDraft {
  const normalized = text.trim();
  const amountText = extractAmountText(normalized);
  const amount = amountText ? parseAmount(amountText, "NGN") : undefined;
  const accountNumber = extractAccountNumber(normalized);
  const bank = findBank(normalized);
  const recipientName = extractRecipientName(normalized);

  return {
    amountMinor: amount?.minor,
    currency: "NGN",
    accountNumber,
    bank: bank ?? undefined,
    recipientName,
    amountText,
  };
}

function extractAmountText(text: string): string | undefined {
  const match = text.match(/(?:₦|ngn|naira)?\s*(\d+(?:\.\d+)?(?:\s*(?:k|thousand|thousand naira|m|million))?)/i);
  if (!match?.[1]) return undefined;
  const value = match[1].trim();
  if (/k$/i.test(value)) {
    const base = Number.parseFloat(value.slice(0, -1));
    return String(base * 1000);
  }
  if (/m$/i.test(value)) {
    const base = Number.parseFloat(value.slice(0, -1));
    return String(base * 1_000_000);
  }
  if (/thousand/i.test(value)) {
    const base = Number.parseFloat(value.replace(/[^\d.]/g, ""));
    return String(base * 1000);
  }
  return value;
}

function extractAccountNumber(text: string): string | undefined {
  const match = text.match(/\b(\d{6,10})\b/);
  return match?.[1];
}

function extractRecipientName(text: string): string | undefined {
  const match = text.match(/(?:for|to|recipient|name is|called)\s+([A-Za-z][A-Za-z\s'-.]{1,40}?)(?=\s+(?:at|in|via|bank|account|number|for|to)\b|$)/i);
  if (match?.[1]) {
    const cleaned = match[1].trim().replace(/^(for|to|recipient|name is|called)\s+/i, "");
    return cleaned.length > 0 ? cleaned : undefined;
  }

  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (/^(skip|no|none|cancel|later|not now)$/i.test(trimmed)) return undefined;
  if (/^\d+$/.test(trimmed)) return undefined;
  if (/^(send|transfer|pay|to|for|account|bank|number)$/i.test(trimmed)) return undefined;
  if (/^[A-Za-z][A-Za-z\s'-.]{1,40}$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
