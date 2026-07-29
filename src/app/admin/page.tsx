import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/admin/auth";
import { type AdminEvent, getFlaggedEvents, getKpis, getRecentEvents, getUsers } from "@/lib/admin/data";
import { formatMoney } from "@/lib/money/format";
import { type Currency, isCurrency, money } from "@/lib/money/types";

export const dynamic = "force-dynamic";

function amountText(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  const cur: Currency = isCurrency(currency) ? currency : "NGN";
  return formatMoney(money(minor, cur));
}

function shortSession(s: string): string {
  return s.replace(/^tg:/, "").slice(0, 10);
}

export default async function AdminDashboard() {
  const jar = await cookies();
  if (!isValidAdminToken(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin/login");

  const [kpis, events, flagged, users] = await Promise.all([
    getKpis(),
    getRecentEvents(30),
    getFlaggedEvents(20),
    getUsers(30),
  ]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-paper-2 bg-naira text-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/kudi-mark.png" alt="Kudi" className="h-7 w-auto brightness-0 invert" />
            <span className="font-display text-lg font-semibold">Operations</span>
          </div>
          <span className="text-sm text-paper/70">Fintech Disruptors · NITHUB 2026</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {!kpis.configured ? (
          <div className="mb-6 rounded-xl border border-brass/40 bg-brass/10 p-4 text-sm text-ink">
            Supabase isn’t configured, so this dashboard has no data yet. Apply
            <code className="mx-1 rounded bg-paper-2 px-1">src/lib/store/schema.sql</code>
            and set <code className="mx-1 rounded bg-paper-2 px-1">STORE=supabase</code>.
          </div>
        ) : null}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Users onboarded" value={String(kpis.users)} />
          <Kpi label="Transfers" value={String(kpis.transfers)} />
          <Kpi label="Transfer volume" value={amountText(kpis.transferVolumeMinor, "NGN")} />
          <Kpi label="Flagged events" value={String(kpis.flagged)} tone={kpis.flagged > 0 ? "alert" : "default"} />
        </section>

        {/* Security / fraud */}
        <Panel title="Security & fraud" subtitle="PIN failures, injection attempts, rejected confirmations, large transfers">
          {flagged.length === 0 ? (
            <Empty text="No flagged activity." />
          ) : (
            <Table
              head={["Time", "Session", "Event", "Amount"]}
              rows={flagged.map((e) => [timeOf(e), shortSession(e.session_id), e.kind, amountText(e.amount_minor, e.currency)])}
              flaggedRows={flagged.map(() => true)}
            />
          )}
        </Panel>

        {/* Transactions */}
        <Panel title="Recent activity">
          {events.length === 0 ? (
            <Empty text="No activity yet — chat with the bot to populate this." />
          ) : (
            <Table
              head={["Time", "Session", "Event", "Amount"]}
              rows={events.map((e) => [timeOf(e), shortSession(e.session_id), e.kind, amountText(e.amount_minor, e.currency)])}
              flaggedRows={events.map((e) => e.flagged)}
            />
          )}
        </Panel>

        {/* Users */}
        <Panel title="Users & wallets">
          {users.length === 0 ? (
            <Empty text="No users onboarded yet." />
          ) : (
            <Table
              head={["Session", "BMONI user", "Wallet address", "Joined"]}
              rows={users.map((u) => [
                shortSession(u.session_id),
                u.bmoni_user_id.slice(0, 8),
                `${u.wallet_address.slice(0, 10)}…${u.wallet_address.slice(-4)}`,
                new Date(u.created_at).toLocaleDateString("en-NG"),
              ])}
            />
          )}
        </Panel>
      </div>
    </main>
  );
}

function timeOf(e: AdminEvent): string {
  return new Date(e.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "alert" }) {
  return (
    <div className="rounded-2xl border border-paper-2 bg-white/60 p-5">
      <div className="text-xs uppercase tracking-widest text-ink-soft">{label}</div>
      <div className={`tnum mt-2 text-2xl font-semibold ${tone === "alert" ? "text-alert" : "text-naira"}`}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold text-naira">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-paper-2 bg-white/60">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-sm text-ink-soft">{text}</p>;
}

function Table({ head, rows, flaggedRows }: { head: string[]; rows: string[][]; flaggedRows?: boolean[] }) {
  return (
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead>
        <tr className="border-b border-paper-2 text-xs uppercase tracking-wider text-ink-soft">
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-paper-2/60 last:border-0">
            {r.map((cell, j) => (
              <td key={j} className={`px-4 py-3 ${j === 0 || j === 3 ? "tnum" : ""} ${flaggedRows?.[i] && j === 2 ? "font-medium text-alert" : "text-ink"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
