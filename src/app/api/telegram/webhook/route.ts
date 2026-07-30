import { NextResponse } from "next/server";
import { transcribe } from "@/lib/agent/stt";
import { handleCallback, handleMessage, handlePhoto } from "@/lib/channel/dispatch";
import { getTelegram, type TelegramUpdate } from "@/lib/channel/telegram";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram webhook — the always-on entry point on Vercel. Verifies the secret
 * token, then routes the update through the (now stateless) dispatcher.
 * All conversation state lives in Supabase, so this works across serverless
 * invocations with no in-memory dependency.
 */
export async function POST(req: Request): Promise<Response> {
  const env = getEnv();
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const tg = getTelegram();
  try {
    const m = update.message;
    if (m?.text) {
      await handleMessage(tg, {
        chatId: String(m.chat.id),
        userId: String(m.from?.id ?? m.chat.id),
        text: m.text,
        fromVoice: false,
        messageId: String(m.message_id),
      });
    } else if (m?.voice) {
      await tg.send({ chatId: String(m.chat.id), text: "Hold on, I dey listen…" });
      const { bytes } = await tg.downloadFile(m.voice.file_id);
      const text = await transcribe(bytes, m.voice.mime_type ?? "audio/ogg");
      if (!text) {
        await tg.send({ chatId: String(m.chat.id), text: "I no hear am well. Fit you type am?" });
      } else {
        await handleMessage(tg, {
          chatId: String(m.chat.id),
          userId: String(m.from?.id ?? m.chat.id),
          text,
          fromVoice: true,
          messageId: String(m.message_id),
        });
      }
    } else if (m?.photo?.length) {
      const largest = m.photo[m.photo.length - 1];
      if (largest) {
        const { bytes, mime } = await tg.downloadFile(largest.file_id);
        await handlePhoto(
          tg,
          { chatId: String(m.chat.id), userId: String(m.from?.id ?? m.chat.id), messageId: String(m.message_id) },
          bytes,
          mime.startsWith("image") ? mime : "image/jpeg",
        );
      }
    } else if (update.callback_query) {
      await handleCallback(tg, {
        chatId: String(update.callback_query.message?.chat.id ?? update.callback_query.from.id),
        data: update.callback_query.data ?? "",
        callbackId: update.callback_query.id,
      });
    }
  } catch (e) {
    log("error", "webhook.failed", { detail: String(e) });
  }
  // Always 200 so Telegram doesn't retry-storm.
  return NextResponse.json({ ok: true });
}
