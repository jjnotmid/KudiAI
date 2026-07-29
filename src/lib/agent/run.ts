import { getLlm, type Turn } from "./llm";
import { SYSTEM_PROMPT } from "./prompt";
import { executeTool, type PendingConfirm, type ToolExecResult, TOOL_SPECS, type UiEvent } from "./tools";

const MAX_ROUNDS = 4;

export interface AgentResult {
  readonly reply: string;
  readonly turns: Turn[];
  readonly confirm?: PendingConfirm;
  readonly ui: UiEvent[];
}

/**
 * Run one user turn through the agent loop (§7.1). Up to 4 tool-calling rounds,
 * then a forced text answer. Returns the reply plus the updated turn history,
 * any pending confirmation (a value-moving action awaiting the user's tap), and
 * UI events for rich channels.
 */
export async function runAgent(
  sessionId: string,
  priorTurns: readonly Turn[],
  userText: string,
  opts: { chaos?: boolean } = {},
): Promise<AgentResult> {
  const llm = getLlm();
  const turns: Turn[] = [...priorTurns, { role: "user", text: userText }];
  const ui: UiEvent[] = [];
  let confirm: PendingConfirm | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const isLast = round === MAX_ROUNDS - 1;
    const res = await llm.complete({
      system: SYSTEM_PROMPT,
      turns,
      // On the final round, drop tools to force a text answer.
      tools: isLast ? [] : TOOL_SPECS,
    });

    if (res.toolCalls.length === 0) {
      turns.push({ role: "assistant", text: res.text });
      return { reply: res.text || fallback(), turns, confirm, ui };
    }

    // Record the assistant's tool-call turn, then execute each tool.
    turns.push({ role: "assistant", text: res.text, toolCalls: res.toolCalls });
    for (const call of res.toolCalls) {
      const out: ToolExecResult = await executeTool(
        { sessionId, chaos: opts.chaos },
        call.name,
        call.args,
      ).catch((e: unknown): ToolExecResult => ({
        modelResult: { error: "tool_failed", detail: String(e) },
      }));
      if (out.ui) ui.push(out.ui);
      // Only the FIRST pending confirmation in a turn is honoured.
      if (out.confirm && !confirm) confirm = out.confirm;
      turns.push({ role: "tool", toolCallId: call.id, name: call.name, result: out.modelResult });
    }
  }

  // Ran out of rounds — force a plain closing answer.
  const res = await llm.complete({ system: SYSTEM_PROMPT, turns, tools: [] });
  turns.push({ role: "assistant", text: res.text });
  return { reply: res.text || fallback(), turns, confirm, ui };
}

function fallback(): string {
  return "I dey here. Tell me wetin you wan do — check balance, make card, or send money.";
}
