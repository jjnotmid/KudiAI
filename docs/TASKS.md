# Kudi — Tasks

Ordered checklist. `[x]` done, `[ ]` todo, `[~]` partial. Keep P0 flows first.

## Phase 0 — setup  ✅
- [x] T-001 Project config: Next 15 + TS strict + Tailwind v4 + Vitest + ESLint, security headers, CSP
- [x] T-002 `.env.example` + `.env.local` with all real creds (Telegram, Groq, Gemini, Supabase, Cloudinary, BMONI, SESSION_SECRET); gitignored
- [x] T-003 Server-only env loader (Zod), `CLAUDE.md`, `docs/` scaffold
- [x] T-004 Money value type (minor units), formatMoney, parseAmount (EN/Pidgin)
- [x] T-005 Brand: logo extracted, palette locked, `docs/BRAND_AND_LANDING.md` + both prompts

## Phase 1 — spine  ✅
- [x] T-010 MoneyProvider interface + SimProvider (Luhn cards, chaos, exact arithmetic) + live stub
- [x] T-011 Seed data + beneficiary resolver
- [x] T-012 LLM adapter (Gemini + Groq + failover); Groq primary (Gemini 429)
- [x] T-013 Agent tools (Zod) + system prompt + run loop (4 rounds)
- [x] T-014 Telegram channel (Bot API) + dispatcher + polling runner
- [x] T-015 Store (memory + Supabase + schema.sql)
- [x] T-016 Confirmation HMAC token (sign/verify/expire/peek) + single-use nonce
- [x] T-017 Rate limiter, redaction logger, Whisper STT
- [x] T-018 Live smoke test green (balance + transfer + confirm token)
- [x] T-019 BMONI full API captured; live stub auth fixed to x-api-key

## Phase 2 — make it real & run it  🔲 (next)
- [ ] T-020 Run the bot live: `npm run bot:dev`, message @KudiAI_Bot, walk flows A/B/C end-to-end
- [ ] T-021 Apply `src/lib/store/schema.sql` in Supabase, set `STORE=supabase`, verify persistence
- [ ] T-022 Label create_card output clearly as a **simulated** card (no BMONI card API)
- [ ] T-023 Telegram confirm/cancel UX polish; move pending-confirm map into Store (webhook-safe)
- [ ] T-024 Cloudinary server-only upload helper (card art / assets)

## Phase 3 — web surface + landing  🔲
- [ ] T-030 Next.js app shell (layout, globals.css with brand tokens, thin demo page)
- [ ] T-031 Telegram webhook route `/api/telegram/webhook` (secret-token verified) for prod
- [ ] T-032 Landing page from `docs/BRAND_AND_LANDING.md` prompt (tally-stroke aesthetic)

## Phase 4 — BMONI live (optional, post-demo)  🔲
- [ ] T-040 User+wallet provisioning: create user → owner-proof → create-managed (owner keypair strategy)
- [ ] T-041 Live get_balance against `…/account/balances` behind the same contract test
- [ ] T-042 Live convert_currency via `…/exchange/convert`
- [ ] T-043 Live NGN payout (verify → register → offramp → EIP-712 sign) — spike only

## Phase 5 — hardening  🔲
- [ ] T-050 Tests: parseAmount (30+), formatMoney, confirm token, redaction, resolver, rate limiter
- [ ] T-051 Contract test suite vs SimProvider (and live when wired)
- [ ] T-052 Eval harness (≥45 EN/Pidgin utterances, tool-selection accuracy report)
- [ ] T-053 CI: typecheck/lint/test/build + secret-scan of client bundle
- [ ] T-054 `verify.sh` green end-to-end; README + DEMO_SCRIPT + HANDOFF

## Known decisions / notes
- Channel = Telegram. Languages = English + Pidgin (Igbo dropped). Voice input only (no TTS).
- LLM_PROVIDER=groq (Gemini quota 429; resets daily). MONEY_PROVIDER=sim. STORE=memory.
- create_card can never be real (no BMONI card API) — keep honest labelling.
