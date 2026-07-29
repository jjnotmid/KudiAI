import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB (§8)

/**
 * Transcribe a voice note to text with Groq Whisper (whisper-large-v3-turbo).
 * Bytes are held in memory only, never written to disk (§8). Returns null on
 * any failure so the caller degrades to asking the user to type.
 *
 * Telegram voice notes are always OGG/Opus, but the file server often labels
 * the download `application/octet-stream`, so we don't reject on mime — we send
 * it as ogg and let Whisper decode.
 */
export async function transcribe(bytes: Uint8Array, mime?: string): Promise<string | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    log("warn", "stt.bad_size", { bytes: bytes.byteLength });
    return null;
  }

  const apiKey = getEnv().GROQ_API_KEY;
  if (!apiKey) {
    log("warn", "stt.no_key", {});
    return null;
  }

  const baseMime = (mime ?? "").split(";")[0]?.trim() || "audio/ogg";
  const ext = baseMime.includes("mp4") || baseMime.includes("m4a")
    ? "m4a"
    : baseMime.includes("wav")
      ? "wav"
      : baseMime.includes("mpeg") || baseMime.includes("mp3")
        ? "mp3"
        : baseMime.includes("webm")
          ? "webm"
          : "ogg";

  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: baseMime }), `voice.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    form.append("language", "en"); // Nigerian English / Pidgin transcribe best as en
    // Bias Whisper toward Kudi's domain vocabulary + Nigerian names so it stops
    // mis-hearing "send am give Chidi" as "send him Tsuki".
    form.append(
      "prompt",
      "Kudi money transfer on Telegram. Nigerian Pidgin. Send money, check balance, create card. Amounts like 2k, 5k, 50k naira. Recipients: Chidi, Ngozi, Emeka, Mama, my brother, my sister.",
    );

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log("error", "stt.groq_failed", { status: res.status, detail: detail.slice(0, 200) });
      return null;
    }
    const json = (await res.json()) as { text?: string };
    const text = json.text?.trim();
    log("info", "stt.ok", { chars: text?.length ?? 0 });
    return text && text.length > 0 ? text : null;
  } catch (e) {
    log("error", "stt.exception", { detail: String(e) });
    return null;
  }
}
