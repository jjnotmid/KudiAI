# Kudi — Brand, Landing Page & Logo Direction

Research-backed design direction plus two ready-to-use prompts (landing page, logo).

## What Kudi is (for anyone designing it)
A talk-to-your-money AI agent for Nigerians. You speak or type in **English, Pidgin or Igbo** on **Telegram** (@KudiAI_Bot), and it checks balance, creates cards, sends money and saves — always confirming before money moves. Powered by the BMONI money platform. The audience is real people who find banking apps confusing: market traders, older users, gig workers.

## Design research — the landscape and where Kudi sits

**The Nigerian/African fintech reference set (what actually reads as credible here):**
- **Paystack** — the gold standard for this market: warm off-white canvas, confident type, *real photography of Nigerians*, generous spacing, one strong brand blue. Feels human and premium, not templated.
- **Moniepoint / OPay / PalmPay** — utilitarian, high-contrast, trust-first. Bold, legible, no fuss. This is what low-literacy users associate with "this works."
- **Kuda** — heavy purple. **Avoid** — it's both overused in fintech and on the brief's banned list.
- **Flutterwave** — orange/yellow energy, playful.

**The tells to avoid (from the build brief §6, which is correct):** purple/violet gradients, glassmorphism/frosted cards, Inter/Poppins/Roboto, the 3–4px colored stripe down the left of a card, three-column feature grids, emoji as icons, the cream (#F4F1EA) + serif + terracotta "AI default" look, gradient text.

**Kudi's authentic well to draw from:** a market trader's **ledger/receipt**, **Naira-note ink** (the deep greens of NGN currency), hand-painted **Lagos shop signage** (confident, slightly imperfect, high-energy lettering), and **Ankara/adire** geometry used *sparingly* as texture — never as decoration for its own sake.

### LOCKED palette — sampled from the actual logo (`brand/logo/1.png`, `2.png`)
| Token | Hex | Rationale |
|---|---|---|
| `naira` | `#0C4B3A` | Deep forest/Naira green — primary. Straight from the logo. |
| `brass` | `#C08A2D` | Gold/ochre — **co-primary** (the logo uses it nearly equally with green), not a tiny accent. |
| `paper` | `#FBF8F2` | Warm off-white logo background. NOT the banned cream. |
| `ink` | `#16150F` | Near-black text, warm not blue-black. |
| `emerald` | `#0F7A54` | Slightly brighter green for "money moved" success states only. |
| `alert` | `#B4362A` | Market red — destructive/cancel only, rare. |

Single-color fallback (Telegram avatar, print): `naira` on `paper`, or `paper` on `naira`.

### The real logo aesthetic (match this everywhere)
The logo builds letterforms from **thin rectangular stick strokes — like ledger tally marks / matchsticks**, green with gold strokes crossing through (the "k" has a gold diagonal bar). This IS the brand's signature and it maps directly onto the market-trader-ledger concept. Carry it into the landing page: section dividers as tally strokes, the gold diagonal as a recurring accent, numbers/amounts that feel tallied. Do not add a different illustration style on top of it. Logo assets live in `brand/logo/`.

### Type (all Google Fonts, none banned)
- **Display:** Bricolage Grotesque *or* Familjen Grotesk — characterful, warm, used with restraint.
- **Body:** Public Sans *or* Instrument Sans — clean, highly legible at small sizes.
- **Money (mono, tabular):** Martian Mono *or* IBM Plex Mono — amounts must never reflow when a digit changes. **Money is the hero of every row.**

### Signature elements (what makes it *Kudi*, not generic fintech)
1. **The ledger row** — the product surface is one continuous vertical record (like a receipt printing), not chat bubbles facing each other. Carry that metaphor onto the landing page.
2. **Money in mono, oversized, tabular** — the largest thing in any row.
3. **The confirmation slip** — the safety moment where value moves; the emotional + trust peak. Show it on the landing page.
4. **Language pills** — a tiny EN / PIDGIN / IGBO control that also shows what Kudi *detected*. "Being understood" is the whole promise.

---

## PROMPT 1 — Landing page build prompt (paste into Claude Code / v0 / Lovable)

> Build a single-page marketing landing site for **Kudi**, a talk-to-your-money AI agent for Nigerians that runs on **Telegram**. Users speak or type in **English, Nigerian Pidgin or Igbo**; Kudi checks balance, creates virtual cards, sends money and saves — always confirming before money moves. Powered by the BMONI money platform.
>
> **Stack:** Next.js 15 (App Router, TypeScript strict), Tailwind CSS v4 with a hand-defined token layer (no component library, no shadcn). Fonts via `next/font/google`. Fully static, deployable to Vercel. Responsive from 360px. WCAG AA contrast, visible focus rings, `prefers-reduced-motion` respected, real semantic HTML.
>
> **Design tokens (use exactly, do not use raw Tailwind palette):** paper `#FBFAF6`, ink `#16150F`, naira `#0C4B3A`, emerald `#0F7A54`, brass `#C08A2D`, alert `#B4362A`. Fonts: display = Bricolage Grotesque, body = Public Sans, mono = Martian Mono (tabular figures for all money).
>
> **Concept:** the whole page reads like a trader's ledger/receipt printing downward — one warm continuous column, generous margins, money always in oversized tabular mono. NOT a chat app with alternating bubbles.
>
> **Sections, in order:**
> 1. **Hero** — left-aligned (not centered). Headline in Pidgin-inflected English, e.g. "Talk to your money. It listens." Subline: one honest sentence about voice + local languages on Telegram. Primary CTA button "Chat on Telegram" → https://t.me/KudiAI_Bot. Beside it, a phone-shaped frame showing a real Kudi exchange: user says *"Send 5k give my brother"* → Kudi restates *"Send ₦5,000 to Chidi, your brother — yes or no?"* → a success row. Amounts in mono.
> 2. **How it works** — three plain steps (Say it → Kudi confirms → Money moves), but do NOT use three equal icon cards in a row. Use a vertical numbered ledger.
> 3. **The safety moment** — feature the confirmation slip: "Kudi never moves money until you say yes." Explain in one paragraph that consent is enforced by the system, not just the AI. This is the trust anchor.
> 4. **Languages** — show the same request in English, Pidgin and Igbo side by side, with the detected-language pill.
> 5. **Who it's for** — Mama Ngozi (market trader) and Emeka (gig worker), as short human quotes, ideally with room for real photography (use tasteful placeholders).
> 6. **Footer** — Telegram CTA repeat, an honest one-line note ("Sandbox demo — no real funds move yet"), NITHUB Innovation Fair 2026 credit.
>
> **Copy rules:** Nigerian, warm, direct. NO buzzwords ("seamless", "empower", "revolutionise", "your all-in-one", "the future of"). No emoji in headings or as icons. Short sentences. Every line should read wrong if you swapped a competitor's name in.
>
> **Banned (hard):** purple/violet/indigo anything, gradients on text or CTAs, glassmorphism/backdrop-blur, the left-edge colored card stripe, uniform rounded-lg on everything, drop-shadow on every surface, three-column feature grids, Lucide/Heroicons as the whole visual identity, scroll-triggered fade-ins on every section. If you need an icon, hand-draw the 2–3 SVGs the page actually needs.
>
> **Motion budget:** almost none. One restrained treatment on the hero exchange (a row settling into place). Nothing bouncy.
>
> Deliver clean, accessible, single-file-per-component code with the token layer in `globals.css` via Tailwind v4 `@theme`.

---

## PROMPT 2 — Logo prompt

**Concept brief (for a designer or vector work):** A Kudi mark that fuses three ideas — **money (₦)**, **voice/speech**, and a **ledger tick/confirmation**. It must work as a 24px Telegram avatar, in a single color, and next to the wordmark "Kudi" set in Bricolage Grotesque. Deep Naira green (`#0C4B3A`) on warm paper (`#FBFAF6`), optional brass (`#C08A2D`) accent. Geometric, confident, slightly hand-painted-signage warmth — not sterile. **Avoid:** generic chat-bubble-plus-coin, gradients, glossy 3D, purple, and anything that looks like a default AI startup logo.

**AI image-generator prompt (Ideogram / Midjourney / DALL·E — Ideogram best for the wordmark):**

> Minimalist vector logo for a fintech brand called "Kudi", a voice money assistant for Nigeria. A single confident geometric mark that reads simultaneously as a stylized Naira sign (₦) and a sound/voice waveform, with a small upward ledger checkmark integrated into the base. Deep Naira-note green (#0C4B3A) on warm off-white (#FBFAF6), one subtle brass-gold accent (#C08A2D). Flat, two-color, no gradient, no 3D, no bevel, no glow. Bold, friendly, high legibility at tiny sizes; balanced negative space; slight hand-painted West-African signage warmth. Wordmark "Kudi" in a warm geometric grotesque beside the mark. Clean, timeless, premium — not a generic tech startup logo, no purple, no chat bubble cliché. White background, centered, generous padding. --v 6 --style raw

Generate 3–4 variants: (1) symbol only, (2) symbol + wordmark horizontal, (3) monochrome single-color, (4) circular avatar crop for Telegram.
