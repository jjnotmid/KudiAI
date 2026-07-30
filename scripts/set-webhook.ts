/**
 * Point the Telegram bot at the deployed webhook (always-on, no PC needed).
 *
 *   npx tsx scripts/set-webhook.ts https://your-app.vercel.app
 *
 * (Appends /api/telegram/webhook automatically.) To go back to local polling,
 * just run `npm run bot:dev` — it deletes the webhook on start.
 */
import { getTelegram } from "@/lib/channel/telegram";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

async function main(): Promise<void> {
  const base = process.argv[2];
  if (!base) {
    console.log("Usage: npx tsx scripts/set-webhook.ts https://your-app.vercel.app");
    process.exit(1);
  }
  const url = base.replace(/\/$/, "") + "/api/telegram/webhook";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.warn("TELEGRAM_WEBHOOK_SECRET is empty — set it in .env.local and Vercel too.");
  }
  await getTelegram().setWebhook(url, secret);
  console.log(`✓ Webhook set to ${url}`);
  console.log("Make sure the SAME TELEGRAM_WEBHOOK_SECRET and STORE=supabase are set in Vercel.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
