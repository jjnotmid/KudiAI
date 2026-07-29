import Link from "next/link";

const TELEGRAM = "https://t.me/KudiAI_Bot";

/**
 * Team — edit names/roles here and drop square photos in /public/team/.
 * Missing photos fall back to a monogram tile, so this renders fine today.
 */
const TEAM: { name: string; role: string; photo?: string }[] = [
  { name: "Team member", role: "Product & AI", photo: "/team/member1.jpg" },
  { name: "Team member", role: "Backend & BMONI", photo: "/team/member2.jpg" },
  { name: "Team member", role: "Frontend & Voice", photo: "/team/member3.jpg" },
];

function TelegramButton({ label = "Chat on Telegram" }: { label?: string }) {
  return (
    <Link
      href={TELEGRAM}
      className="inline-flex items-center gap-2 rounded-full bg-naira px-6 py-3 font-medium text-paper transition-colors hover:bg-naira-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      {label}
      <span aria-hidden className="tnum text-brass">
        →
      </span>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kudi-wordmark.png" alt="Kudi" className="h-8 w-auto" />
        <div className="hidden sm:block">
          <TelegramButton />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-2 md:pt-14">
        <div>
          <div className="tally-rule mb-6" aria-hidden>
            <span /> <span /> <span /> <span />
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-naira md:text-6xl">
            Talk to your money.
            <br />
            It listens.
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink-soft">
            Kudi is a money assistant on Telegram. Check your balance, make a card, or send
            money just by talking — in English or Pidgin, by voice or text. It always asks
            before it moves your money.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <TelegramButton label="Start on Telegram" />
            <span className="text-sm text-ink-soft">Free. No app to install.</span>
          </div>
        </div>

        {/* Conversation receipt */}
        <div className="rounded-2xl border border-paper-2 bg-white/60 p-5 shadow-sm">
          <p className="mb-4 text-xs uppercase tracking-widest text-ink-soft">A Kudi conversation</p>
          <div className="space-y-4 text-[15px]">
            <Row who="You" text="How much I get?" />
            <Row who="Kudi" text="You get ₦250,000 and $120." amount="₦250,000" />
            <Row who="You" text="Send 5k give my brother" />
            <Row who="Kudi" text="Send ₦5,000 to Chidi, your brother?" amount="₦5,000" gate />
            <Row who="You" text="•  •  •  •  (PIN)" mono />
            <Row who="Kudi" text="Done. ₦5,000 sent to Chidi. Balance ₦245,000." amount="₦245,000" ok />
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="border-y border-paper-2 bg-paper-2/40">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold text-naira md:text-4xl">
            For the people banking apps leave behind.
          </h2>
          <div className="mt-6 space-y-4 text-lg text-ink-soft">
            <p>
              Millions of Nigerians have money to manage but are shut out by the interface — not the
              money. Banking apps are dense, English-first and full of menus. If you read English
              slowly, or you have never lived inside an app, the app itself becomes the wall.
            </p>
            <p>
              A market trader, an older parent, someone who has always asked their child to “help me
              press it” — they should not need app literacy to save, to pay a supplier, to move
              their own money. So we made the interface a <strong className="text-ink">conversation</strong>,
              in the language they already speak, out loud if they want.
            </p>
            <p className="text-ink">
              That is Kudi. Money anyone can use, just by talking — and it always asks before it moves
              a naira.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-5 py-16">
        <h2 className="font-display text-3xl font-semibold text-naira">How it works</h2>
        <ol className="mt-8 space-y-6">
          <Step n="1" title="Say it" body="Type or send a voice note: “Send 5k give my brother.” Kudi understands English and Pidgin." />
          <Step n="2" title="Kudi shows you a slip" body="It repeats the exact amount and who it is going to, and waits. Nothing has moved yet." />
          <Step n="3" title="Approve with your PIN" body="You enter your 4-digit PIN. Only then does the money move — and your balance updates." />
        </ol>
      </section>

      {/* Safety */}
      <section className="border-y border-paper-2 bg-naira text-paper">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <h2 className="font-display text-3xl font-semibold">Kudi never moves money until you approve.</h2>
            <p className="mt-4 max-w-lg text-paper/80">
              Every transfer is locked behind a signed, single-use confirmation and your PIN. The AI
              can understand what you want — but it is structurally unable to move money on its own.
              Even a tricky message can’t make Kudi send a naira you didn’t approve.
            </p>
          </div>
          <ul className="space-y-3 text-paper/90">
            <Guard text="Restates the exact amount and recipient" />
            <Guard text="Your 4-digit PIN authorises every send" />
            <Guard text="One-time confirmation that expires in 90 seconds" />
            <Guard text="Card numbers never stored or shown in full" />
          </ul>
        </div>
      </section>

      {/* Languages */}
      <section className="mx-auto max-w-4xl px-5 py-16">
        <h2 className="font-display text-3xl font-semibold text-naira">In your own language</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full border border-naira px-4 py-1.5 text-sm font-medium text-naira">English</span>
          <span className="rounded-full border border-brass bg-brass/10 px-4 py-1.5 text-sm font-medium text-brass">Nigerian Pidgin</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Quote lang="English" text="“What’s my balance?” → “Your balance is ₦250,000 and $120.”" />
          <Quote lang="Pidgin" text="“How much I get?” → “You get ₦250,000 and $120.”" />
        </div>
      </section>

      {/* Team */}
      <section className="border-t border-paper-2 bg-paper-2/40">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold text-naira">The team</h2>
          <p className="mt-2 text-ink-soft">Fintech Disruptors · NITHUB Innovation Fair 2026</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {TEAM.map((m, i) => (
              <figure key={i} className="text-center">
                <div className="mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-2xl border border-paper-2 bg-white">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-4xl text-naira/30">
                      {m.name.charAt(0)}
                    </div>
                  )}
                </div>
                <figcaption className="mt-3">
                  <div className="font-display font-semibold text-ink">{m.name}</div>
                  <div className="text-sm text-ink-soft">{m.role}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="mx-auto max-w-6xl px-5 py-16 text-center">
        <h2 className="font-display text-4xl font-bold text-naira">Money anyone can use.</h2>
        <div className="mt-6 flex justify-center">
          <TelegramButton label="Talk to Kudi" />
        </div>
        <p className="mx-auto mt-8 max-w-md text-sm text-ink-soft">
          Sandbox demo — no real funds move. Built on the BMONI platform for the NITHUB Innovation
          Fair 2026.
        </p>
      </footer>
    </main>
  );
}

function Row({ who, text, amount, mono, gate, ok }: { who: string; text: string; amount?: string; mono?: boolean; gate?: boolean; ok?: boolean }) {
  const isKudi = who === "Kudi";
  return (
    <div className={`flex gap-3 ${isKudi ? "" : "pl-6"}`}>
      <span className={`w-9 shrink-0 text-xs font-semibold uppercase ${isKudi ? "text-naira" : "text-ink-soft"}`}>{who}</span>
      <p className={`flex-1 ${mono ? "tnum tracking-[0.3em]" : ""} ${ok ? "text-emerald" : gate ? "text-ink" : "text-ink-soft"}`}>
        {text}
        {amount ? <span className="tnum ml-2 font-semibold text-naira">{amount}</span> : null}
      </p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-5">
      <span className="tnum flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-brass font-semibold text-brass">
        {n}
      </span>
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-ink-soft">{body}</p>
      </div>
    </li>
  );
}

function Guard({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="tnum mt-0.5 font-semibold text-brass">
        ✓
      </span>
      <span>{text}</span>
    </li>
  );
}

function Quote({ lang, text }: { lang: string; text: string }) {
  return (
    <div className="rounded-xl border border-paper-2 bg-white/60 p-5">
      <div className="text-xs uppercase tracking-widest text-brass">{lang}</div>
      <p className="mt-2 text-ink">{text}</p>
    </div>
  );
}
