# CLAUDE.md — Kudi

Memory across sessions. Read this first.

## What Kudi is
A conversational AI money agent for Nigerians, on **Telegram** (@KudiAI_Bot). Users
speak or type in **English or Nigerian Pidgin**; an LLM agent interprets intent,
calls a money tool, always confirms before value moves, and replies in the user's
language. The conversation is the product. Powered by the **BMONI** platform.

Context: NITHUB Innovation Fair 2026, theme "Intelligent Money for Everyone".
Code must be launch-grade.

## Scope decisions made with the user (override the original brief/PRD)
- **Channel = Telegram** (not the web app, not WhatsApp). WhatsApp was dropped as too
  heavy; Telegram chosen for zero-friction bot setup. Architecture is channel-agnostic.
- **Igbo dropped.** Languages are English + Nigerian Pidgin only.
- **No voice output (TTS).** Voice **input** kept (Telegram voice note → Whisper → text).
- **Supabase** = persistent backend (behind a Store interface; in-memory is the default/fallback).
- **Cloudinary** = image storage (server-only; helper not yet built).
- **LLM = Groq primary** (Gemini free quota was exhausted / 429), Gemini failover. Adapter picks via `LLM_PROVIDER`.

## The three P0 flows (must work)
- **A Balance** — "How much I get?" → get_balance → reply + values.
- **B Card** — "Create card for subscription" → create_card → render card (last4 only).
- **C Transfer** — "Send 5k give my brother" → prepare_transfer resolves Chidi, shows a
  confirmation slip; the user taps ✔ Confirm; the SERVER executes the transfer.

P1: set_savings (first save now, no recurrence), convert_currency. P2: scam-check, spend summary.

## Non-negotiable rules
- **Money is integer minor units + currency. Never a float.** (`src/lib/money`)
- **No secret ever reaches the browser.** All keys server-side. Enforced in CI (planned).
- **The client never decides money moves.** The LLM can only call `prepare_transfer`
  (mints an HMAC token). `send_money`/`convert` run server-side after the user taps
  confirm, re-verifying the token. A hallucination/injection cannot move money.
- **Confirmation token** = HMAC-SHA256 over {session, action, amount, currency, recipient,
  nonce, expiry}, TTL 90s, single-use (nonce consumed in the Store). (`src/lib/agent/confirm.ts`)
- Never present a simulated BMONI response as real — UI must say "Sandbox simulator".
- Card PAN never persisted/logged/shown beyond last4.
- Never lower a test threshold to make it pass.

## Stack
Next.js 15 (App Router, TS strict) · Tailwind v4 (hand-rolled tokens, no component lib) ·
Zod at every boundary · Vitest · raw fetch for LLM/Telegram/BMONI (no SDKs) · Supabase JS ·
Vercel (webhook) or `npm run bot:dev` (local long-polling).

## Architecture (adapters everywhere)
- `src/lib/money` — Money value type, formatMoney, parseAmount (EN/Pidgin).
- `src/lib/bmoni` — MoneyProvider interface; **SimProvider** (default, deterministic, Luhn
  cards, chaos injection), **BmoniLiveProvider** (base URL + x-api-key confirmed; card/
  transfer/conversion endpoints TBD). Factory picks via `MONEY_PROVIDER`. Seed: Chidi/Ngozi/Emeka/Mama.
- `src/lib/agent` — llm (Gemini+Groq+failover), prompt, tools (Zod + specs), run (loop, 4 rounds),
  confirm (HMAC), stt (Whisper).
- `src/lib/channel` — Channel interface; TelegramChannel (full Bot API); dispatch (message +
  confirm/cancel callback execution).
- `src/lib/store` — Store interface; MemoryStore (default) + SupabaseStore (+ schema.sql).
- `src/lib/{env,log,ratelimit}` — env (server-only, Zod), redaction logger, token-bucket limiter.
- `scripts/` — bot-polling (run the bot), demo-reset, smoke (live agent test).

## BMONI reality (full API captured in docs/bmoni/API.md)
Base URL `https://embedded-dev.bmoni.com`, auth `x-api-key`. Smart-wallet/**stablecoin** platform
(CNGN=NGN, USDB=USD). BMONI handles KYC end-to-end. Key facts that shape our flows:
- **No virtual-card API exists.** create_card is **simulator-only** and must be labelled as simulated.
- **get_balance** and **convert_currency** are real & feasible (`…/account/balances`, `…/exchange/convert`).
- **send_money = NGN offramp/bank payout**: verify account → register withdrawal account → offramp →
  **EIP-712 signature** on the proposal. Every money MOVE requires a provisioned on-chain smart wallet
  (owner address + owner-proof signature) and client-side signing. Heavy → demo runs on **sim**.
- Verified live: `POST /v1/users` works with the shared sandbox key.

## Current state (update this each session)
- ✅ Spine done & typechecks clean: config, money, bmoni sim+live-stub, confirm, llm, telegram,
  store, agent tools+loop, dispatch, stt, ratelimit, log, env. All real creds in `.env.local`.
- ✅ Live smoke test passes: balance + transfer + confirm token work (via Groq).
- ✅ Brand locked (logo in `brand/logo/`, palette #0C4B3A/#C08A2D/#FBF8F2).
- 🔲 Next: Next.js app shell + Telegram webhook route + landing page; tests (unit/contract/eval);
  CI + secret-scan; Cloudinary helper; run the bot live (`npm run bot:dev`). See docs/TASKS.md.

## How to run
`npm run bot:dev` — starts the Telegram bot on long-polling (no deploy). Message @KudiAI_Bot.
`npx tsx scripts/smoke.ts` — live agent smoke test. `npx tsc --noEmit` — typecheck.
