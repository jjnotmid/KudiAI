/** Quick live smoke test of the agent brain (real LLM + sim provider). */
import { runAgent } from "@/lib/agent/run";
import { getLlm } from "@/lib/agent/llm";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

async function main(): Promise<void> {
  const session = "smoke-1";
  console.log("LLM primary:", getLlm().name);

  const a = await runAgent(session, [], "How much I get?");
  console.log("\n[balance] user: How much I get?");
  console.log("kudi:", a.reply);
  console.log("ui:", JSON.stringify(a.ui));

  const b = await runAgent(session, a.turns, "Send 5k give my brother");
  console.log("\n[transfer] user: Send 5k give my brother");
  console.log("kudi:", b.reply);
  console.log("confirm:", b.confirm ? `${b.confirm.slip} (token len ${b.confirm.token.length})` : "none");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
