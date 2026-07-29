import { getEnv } from "@/lib/env";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB (§8)
const ALLOWED_MIME = new Set(["audio/ogg", "audio/webm", "audio/mp4", "audio/wav", "audio/mpeg"]);

/**
 * Transcribe a voice note to text with Groq Whisper (whisper-large-v3-turbo).
 * Bytes are held in memory only, never written to disk (§8). Returns null on
 * any failure so the caller degrades to asking the user to type.
 */
export async function transcribe(
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
  const baseMime = mime.split(";")[0]?.trim() ?? "audio/ogg";
  if (!ALLOWED_MIME.has(baseMime)) return null;

  const apiKey = getEnv().GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: baseMime }), "voice.ogg");
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    // Bias toward English/Pidgin; Whisper handles Nigerian English well.
    form.append("language", "en");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    const text = json.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
