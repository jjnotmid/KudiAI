/**
 * Local long-polling runner. Start with `npm run bot:dev`. No deploy, no public
 * URL needed — it pulls updates from Telegram and dispatches them. Use this for
 * development and the demo; use the webhook route for production.
 */
import { handleCallback, handleMessage } from "@/lib/channel/dispatch";
import { getTelegram } from "@/lib/channel/telegram";

loadEnv();

async function main(): Promise<void> {
  const tg = getTelegram();
  await tg.deleteWebhook(); // polling and webhook are mutually exclusive
  console.log("Kudi bot polling… press Ctrl+C to stop.");

  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let updates;
    try {
      updates = await tg.getUpdates(offset, 25);
    } catch (e) {
      console.error("getUpdates failed, retrying in 2s:", String(e));
      await sleep(2000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try {
        if (u.message?.text) {
          await handleMessage(tg, {
            chatId: String(u.message.chat.id),
            userId: String(u.message.from?.id ?? u.message.chat.id),
            text: u.message.text,
            fromVoice: false,
            messageId: String(u.message.message_id),
          });
        } else if (u.message?.voice) {
          await tg.send({ chatId: String(u.message.chat.id), text: "Hold on, I dey listen…" });
          const { bytes } = await tg.downloadFile(u.message.voice.file_id);
          const { transcribe } = await import("@/lib/agent/stt");
          const text = await transcribe(bytes, u.message.voice.mime_type ?? "audio/ogg");
          if (!text) {
            await tg.send({ chatId: String(u.message.chat.id), text: "I no hear am well. Fit you type am?" });
          } else {
            await handleMessage(tg, {
              chatId: String(u.message.chat.id),
              userId: String(u.message.from?.id ?? u.message.chat.id),
              text,
              fromVoice: true,
              messageId: String(u.message.message_id),
            });
          }
        } else if (u.callback_query) {
          await handleCallback(tg, {
            chatId: String(u.callback_query.message?.chat.id ?? u.callback_query.from.id),
            data: u.callback_query.data ?? "",
            callbackId: u.callback_query.id,
          });
        }
      } catch (e) {
        console.error("update handling failed:", String(e));
      }
    }
  }
}

function loadEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    console.warn("No .env.local found — relying on process env.");
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
