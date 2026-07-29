import { getEnv } from "@/lib/env";

/**
 * Provider-agnostic LLM interface with tool calling (§5.1). Two implementations
 * (Gemini primary, Groq fallback) behind one interface, with automatic failover:
 * a 429/5xx on the primary retries once with backoff, then switches to the
 * secondary for the rest of the session.
 *
 * The conversation is kept in a NEUTRAL shape here; each provider serialises it
 * to its own wire format. Tool ARGS are returned untyped and validated with Zod
 * at the tool boundary — never trusted raw.
 */

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema object for the tool arguments. */
  readonly parameters: Record<string, unknown>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
}

export type Turn =
  | { readonly role: "user"; readonly text: string }
  | { readonly role: "assistant"; readonly text?: string; readonly toolCalls?: readonly ToolCall[] }
  | { readonly role: "tool"; readonly toolCallId: string; readonly name: string; readonly result: unknown };

export interface LlmResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
}

export interface CompleteOpts {
  readonly system: string;
  readonly turns: readonly Turn[];
  readonly tools: readonly ToolSpec[];
}

export interface LlmProvider {
  readonly name: "gemini" | "groq";
  complete(opts: CompleteOpts): Promise<LlmResponse>;
}

class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────
class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;
  // Stable, fast, strong tool-calling, generous free tier, and NOT a "thinking"
  // model — so it won't burn the output budget on reasoning tokens.
  private readonly model = "gemini-2.0-flash";
  constructor(private readonly apiKey: string) {}

  async complete(opts: CompleteOpts): Promise<LlmResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.turns.map(toGeminiContent),
      tools:
        opts.tools.length > 0
          ? [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
          : undefined,
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new LlmHttpError(res.status, `gemini ${res.status}: ${await safeText(res)}`);
    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const [i, p] of parts.entries()) {
      if (p.text) text += p.text;
      if (p.functionCall) {
        toolCalls.push({ id: `gm_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} });
      }
    }
    return { text: text.trim(), toolCalls };
  }
}

function toGeminiContent(turn: Turn): GeminiContent {
  if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };
  if (turn.role === "assistant") {
    const parts: GeminiPart[] = [];
    if (turn.text) parts.push({ text: turn.text });
    for (const tc of turn.toolCalls ?? []) parts.push({ functionCall: { name: tc.name, args: (tc.args as Record<string, unknown>) ?? {} } });
    return { role: "model", parts: parts.length ? parts : [{ text: "" }] };
  }
  return {
    role: "user",
    parts: [{ functionResponse: { name: turn.name, response: { result: turn.result } } }],
  };
}

// ── Groq (OpenAI-compatible) ───────────────────────────────────────────
class GroqProvider implements LlmProvider {
  readonly name = "groq" as const;
  private readonly model = "llama-3.3-70b-versatile";
  constructor(private readonly apiKey: string) {}

  async complete(opts: CompleteOpts): Promise<LlmResponse> {
    const messages: OpenAiMessage[] = [{ role: "system", content: opts.system }];
    for (const turn of opts.turns) messages.push(...toOpenAiMessages(turn));
    const body = {
      model: this.model,
      temperature: 0.2,
      max_tokens: 512,
      messages,
      tools:
        opts.tools.length > 0
          ? opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
          : undefined,
    };
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new LlmHttpError(res.status, `groq ${res.status}: ${await safeText(res)}`);
    const json = (await res.json()) as OpenAiResponse;
    const msg = json.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: parseJsonSafe(tc.function.arguments),
    }));
    return { text: (msg?.content ?? "").trim(), toolCalls };
  }
}

function toOpenAiMessages(turn: Turn): OpenAiMessage[] {
  if (turn.role === "user") return [{ role: "user", content: turn.text }];
  if (turn.role === "assistant") {
    return [
      {
        role: "assistant",
        content: turn.text ?? "",
        tool_calls: turn.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        })),
      },
    ];
  }
  return [{ role: "tool", tool_call_id: turn.toolCallId, content: JSON.stringify(turn.result ?? {}) }];
}

// ── Failover wrapper ────────────────────────────────────────────────────
class FailoverLlm implements LlmProvider {
  private useSecondary = false;
  constructor(
    private readonly primary: LlmProvider,
    private readonly secondary: LlmProvider | null,
  ) {}
  get name(): "gemini" | "groq" {
    return this.useSecondary && this.secondary ? this.secondary.name : this.primary.name;
  }

  async complete(opts: CompleteOpts): Promise<LlmResponse> {
    if (this.useSecondary && this.secondary) return this.secondary.complete(opts);
    try {
      return await this.primary.complete(opts);
    } catch (e) {
      const retryable = e instanceof LlmHttpError ? e.retryable : true;
      // Retryable (429/5xx/network): one backoff retry on the primary first.
      if (retryable) {
        await delay(400);
        try {
          return await this.primary.complete(opts);
        } catch {
          /* fall through to failover */
        }
      }
      // Any remaining failure (including 4xx like a bad model) → secondary.
      if (this.secondary) {
        console.warn(`[llm] primary ${this.primary.name} unavailable — switching to ${this.secondary.name}`);
        this.useSecondary = true;
        return this.secondary.complete(opts);
      }
      throw e;
    }
  }
}

let cached: LlmProvider | null = null;

export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = getEnv();
  const gemini = env.GEMINI_API_KEY ? new GeminiProvider(env.GEMINI_API_KEY) : null;
  const groq = env.GROQ_API_KEY ? new GroqProvider(env.GROQ_API_KEY) : null;

  const primaryFirst: (LlmProvider | null)[] =
    env.LLM_PROVIDER === "groq" ? [groq, gemini] : [gemini, groq];
  const available = primaryFirst.filter((p): p is LlmProvider => p !== null);
  if (available.length === 0) {
    throw new Error("No LLM configured. Set GEMINI_API_KEY or GROQ_API_KEY.");
  }
  cached = new FailoverLlm(available[0] as LlmProvider, available[1] ?? null);
  return cached;
}

// ── helpers & wire types ────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
function parseJsonSafe(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}
interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}
interface OpenAiResponse {
  choices?: { message?: { content?: string; tool_calls?: OpenAiToolCall[] } }[];
}
