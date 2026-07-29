/**
 * Restore seeded demo state so we can rehearse repeatedly (§12). With the memory
 * store this is a no-op across processes (just restart `bot:dev`); with Supabase
 * it truncates the session's stored turns and nonces.
 */
import { getStore } from "@/lib/store";

loadEnv();

async function main(): Promise<void> {
  const sessionArg = process.argv[2];
  const store = getStore();
  if (store.name === "memory") {
    console.log("Store is in-memory: just restart `npm run bot:dev` to reset state.");
    return;
  }
  if (!sessionArg) {
    console.log("Usage: npm run demo:reset -- tg:<chatId>");
    return;
  }
  await store.reset(sessionArg);
  console.log(`Reset session ${sessionArg}. The BMONI simulator reseeds on next message.`);
}

function loadEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* rely on process env */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
