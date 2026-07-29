export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <form method="POST" action="/api/admin/login" className="w-full max-w-sm rounded-2xl border border-paper-2 bg-white/70 p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/kudi-wordmark.png" alt="Kudi" className="mx-auto mb-6 h-7 w-auto" />
        <h1 className="font-display text-xl font-semibold text-naira">Admin sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">Kudi operations dashboard.</p>
        <label className="mt-6 block text-sm font-medium text-ink" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="mt-1 w-full rounded-lg border border-paper-2 bg-paper px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-brass"
        />
        {error ? <p className="mt-2 text-sm text-alert">Wrong password.</p> : null}
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-naira py-2.5 font-medium text-paper transition-colors hover:bg-naira-deep"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
