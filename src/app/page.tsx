import Link from "next/link";

const TELEGRAM = "https://t.me/KudiAI_Bot";

/**
 * Team — edit names/roles here and drop square photos in /public/team/.
 * Missing photos fall back to a monogram tile, so this renders fine today.
 */
const TEAM: { name: string; role: string; photo?: string; github: string }[] = [
  { name: "Usifoh Joshua", role: "Fullstack Developer", photo: "/team/joshua.jpg", github: "https://github.com/jjnotmid" },
  { name: "Oyetunji Obadiah Samuel", role: "Product Manager", photo: "/team/obadiah.png", github: "https://github.com/oyetunjiobadiah" },
  { name: "Olumuwagun Daniel Oluwaferanmi", role: "Frontend Developer", photo: "/team/daniel.png", github: "https://github.com/Danieldev" },
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
        <img src="/brand/kudi-wordmark-t.png" alt="Kudi AI" className="h-11 w-auto" />
        <div className="hidden sm:block">
          <TelegramButton />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_12%_0%,rgba(12,75,58,0.06),transparent),radial-gradient(40%_40%_at_100%_15%,rgba(192,138,45,0.10),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-10 md:grid-cols-[1.05fr_0.95fr] md:pt-16">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/kudi-wordmark-t.png" alt="Kudi AI" className="mb-7 h-16 w-auto md:h-20" />
            <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-naira md:text-[4.25rem] md:leading-[1.0]">
              Talk to your money.
              <br />
              <span className="text-brass">It listens.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              Check your balance, make a card, or send money just by talking — by voice or text, in
              English or Pidgin. Kudi always asks before it moves a single naira.
            </p>
            <div className="mt-10 flex flex-col items-start gap-3">
              <TelegramButton label="Start on Telegram" />
              <span className="text-sm text-ink-soft">Free · No app to install · Voice or text</span>
            </div>
          </div>

          {/* Phone frame with the conversation */}
          <div className="mx-auto w-full max-w-[330px]">
            <div className="rounded-[2.4rem] border border-ink/10 bg-naira p-2.5 shadow-2xl shadow-naira/25">
              <div className="rounded-[1.9rem] bg-paper px-4 pb-6 pt-4">
                <div className="mb-5 flex items-center gap-2 border-b border-paper-2 pb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/kudi-mark-t.png" alt="" className="h-6 w-auto" />
                  <span className="font-display text-sm font-semibold text-naira">Kudi</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald" />online
                  </span>
                </div>
                <div className="space-y-2.5">
                  <Bubble side="user">How much I get?</Bubble>
                  <Bubble side="kudi">
                    You get <b className="tnum">₦250,000</b> and <b className="tnum">$120</b>.
                  </Bubble>
                  <Bubble side="user">Send 5k give my brother</Bubble>
                  <Bubble side="kudi">
                    Send <b className="tnum">₦5,000</b> to Chidi? Enter your PIN to approve.
                  </Bubble>
                  <Bubble side="user">
                    <span className="tnum tracking-[0.3em]">••••</span>
                  </Bubble>
                  <Bubble side="kudi" ok>
                    ✅ Sent to Chidi. New balance <b className="tnum">₦245,000</b>.
                  </Bubble>
                </div>
              </div>
            </div>
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
        <p className="mt-3 max-w-xl text-lg text-ink-soft">
          Kudi understands English and Nigerian Pidgin, and answers the way you spoke to it.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Quote lang="English" text="“What’s my balance?” → “Your balance is ₦250,000 and $120.”" />
          <Quote lang="Pidgin" text="“How much I get?” → “You get ₦250,000 and $120.”" />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-paper-2 bg-paper-2/40">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold text-naira">Everything money, one chat</h2>
          <p className="mt-3 max-w-xl text-lg text-ink-soft">
            No app to learn. Kudi does the work — you just talk.
          </p>
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {[
              ["Send to any bank", "Verified recipient name before a naira leaves. PIN on every transfer."],
              ["Save on the go", "“Save 2k” and it’s tucked away. Build the habit without thinking."],
              ["USD accounts", "Open a dollar account and convert naira to USD at a live rate."],
              ["Fraud watch", "Unusual transfers get flagged and double-checked before they go out."],
              ["Money advice", "“Can I afford this?” Kudi answers from your real balance."],
              ["Spending insights", "“Where did my money go?” — a clear breakdown, any time."],
              ["Virtual cards", "Spin up a card for online payments in seconds."],
              ["Voice or text, EN & Pidgin", "Send a voice note in Pidgin. Kudi understands and replies your way."],
            ].map(([title, body]) => (
              <div key={title}>
                <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t border-paper-2 bg-paper-2/40">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold text-naira">The team</h2>
          <p className="mt-2 text-ink-soft">The people building Kudi.</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {TEAM.map((m, i) => (
              <figure key={i} className="text-center">
                <div className="mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-2xl border border-paper-2 bg-white">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt={m.name} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-4xl text-naira/30">
                      {m.name.charAt(0)}
                    </div>
                  )}
                </div>
                <figcaption className="mt-3">
                  <div className="font-display font-semibold text-ink">{m.name}</div>
                  <div className="text-sm text-ink-soft">{m.role}</div>
                  <a
                    href={m.github}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-naira underline decoration-brass/50 underline-offset-2 hover:text-brass"
                  >
                    {m.github.replace("https://github.com/", "@")}
                  </a>
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
          Money anyone can use, just by talking — in your own language.
        </p>
        <p className="mx-auto mt-2 text-xs text-ink-soft/70">© 2026 Kudi</p>
      </footer>
    </main>
  );
}

function Bubble({ side, ok, children }: { side: "user" | "kudi"; ok?: boolean; children: React.ReactNode }) {
  const isUser = side === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${
          isUser
            ? "rounded-br-sm bg-naira text-paper"
            : ok
              ? "rounded-bl-sm border border-emerald/25 bg-emerald/10 text-emerald"
              : "rounded-bl-sm border border-paper-2 bg-white text-ink"
        }`}
      >
        {children}
      </div>
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
