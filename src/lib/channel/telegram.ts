import { getEnv } from "@/lib/env";
import type { Channel, OutgoingMessage } from "./types";

/**
 * Telegram Bot API client — plain fetch, no SDK. Implements the Channel
 * interface plus the extra Bot-API calls the webhook and polling runner need
 * (getUpdates, setWebhook, getFile + voice download).
 */
export class TelegramChannel implements Channel {
  readonly name = "telegram" as const;
  private readonly base: string;

  constructor(private readonly token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result as T;
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const reply_markup = msg.buttons
      ? {
          inline_keyboard: msg.buttons.map((row) =>
            row.map((b) => ({ text: b.label, callback_data: b.data })),
          ),
        }
      : undefined;
    await this.call("sendMessage", {
      chat_id: msg.chatId,
      text: msg.text,
      parse_mode: "HTML",
      reply_markup,
    });
  }

  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.call("answerCallbackQuery", { callback_query_id: callbackId, text });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      await this.call("deleteMessage", { chat_id: chatId, message_id: Number(messageId) });
    } catch {
      /* message may be too old to delete — best effort */
    }
  }

  // ── Extras used by webhook/polling ─────────────────────────────────
  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
    });
  }

  async deleteWebhook(dropPending = true): Promise<void> {
    // Drop the backlog on startup so a fresh bot run doesn't replay old messages.
    await this.call("deleteWebhook", { drop_pending_updates: dropPending });
  }

  async getUpdates(offset: number, timeoutSec = 25): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "callback_query"],
    });
  }

  /** Download a voice note / file by file_id and return raw bytes. */
  async downloadFile(fileId: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const file = await this.call<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new Error("telegram getFile: no file_path");
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "audio/ogg";
    return { bytes, mime };
  }
}

let cached: TelegramChannel | null = null;
export function getTelegram(): TelegramChannel {
  if (cached) return cached;
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  cached = new TelegramChannel(token);
  return cached;
}

// ── Bot API update shapes (only the fields we use) ───────────────────
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
    voice?: { file_id: string; duration: number; mime_type?: string };
    photo?: { file_id: string; file_size?: number }[];
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number } };
    data?: string;
  };
}
