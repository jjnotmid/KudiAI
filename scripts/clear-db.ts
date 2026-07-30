/**
 * Wipe all Kudi data from Supabase (for testing / demo reset).
 *
 *   npm run db:clear
 *
 * Deletes every row from all kudi_* tables. Does NOT drop the tables.
 * BMONI users created in the sandbox are not deleted (they live on BMONI's side);
 * this only clears our app state so the bot treats everyone as brand-new.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

const TABLES = [
  "kudi_flow",
  "kudi_pending",
  "kudi_events",
  "kudi_bmoni_accounts",
  "kudi_pins",
  "kudi_turns",
  "kudi_nonces",
];

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local");
    process.exit(1);
  }
  for (const t of TABLES) {
    // session_id=neq.<impossible> matches every row → deletes all.
    const res = await fetch(`${url}/rest/v1/${t}?session_id=neq.__never__`, {
      method: "DELETE",
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    console.log(`${t}: ${res.ok ? "cleared" : `HTTP ${res.status}`}`);
  }
  console.log("\n✓ Kudi data cleared. Anyone who messages the bot now starts fresh.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
