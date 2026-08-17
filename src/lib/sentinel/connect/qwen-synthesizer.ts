// Qwen3:1.7b local synthesis — PRIMARY synthesizer for ensemble and REASONER_PLUS_CRITIC.
// Falls back to heuristic automatically when Qwen is unavailable, slow, or returns invalid output.
// NEVER sends raw provider chain-of-thought. Gives Qwen structured worker findings only.

import type { WorkerOutput } from "./ensemble";

const OLLAMA_URL = process.env.OLLAMA_API_URL ?? "http://localhost:11434";
const QWEN_MODEL = "qwen3:1.7b";
const SYNTHESIS_TIMEOUT_MS = 12000;

export type SynthesisResult = {
  answer: string;
  backend: "qwen" | "heuristic";
  model: string;
  latencyMs: number;
};

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function buildWorkerSummary(output: WorkerOutput): string {
  const answer = output.answer.slice(0, 900).trim();
  const sentences = answer.split(/[.!?]\s+/);
  const keyLines = sentences.slice(0, 6).join(". ").trim();
  return `[${output.role.toUpperCase()}]\n${keyLines}`;
}

async function tryQwenSynthesis(
  successful: WorkerOutput[],
  userQuestion: string,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), SYNTHESIS_TIMEOUT_MS);

    const workerSummaries = successful.map(buildWorkerSummary).join("\n\n---\n\n");

    const synthesisPrompt = `/no_think You are a financial AI synthesizer. Multiple analysts provided structured findings below. Produce ONE coherent Sentinel response.

Rules:
- Merge agreements, note material disagreements
- Prefer factual and quantitative claims
- Drop duplicated points
- Do NOT mention provider names, model names, or analyst labels in your response
- Write in clear financial analysis prose
- If analysts disagree materially, state both views and explain the tension

Worker Findings:
${workerSummaries}

Original Question: ${userQuestion.slice(0, 400)}

Produce the final unified Sentinel answer:`;

    const body = JSON.stringify({
      model: QWEN_MODEL,
      think: false,
      stream: false,
      options: { num_predict: 600 },
      messages: [
        { role: "user", content: synthesisPrompt },
      ],
    });

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data?.message?.content ?? "";
    const cleaned = stripThinkTags(raw).trim();
    if (cleaned.length < 30) return null;
    return cleaned;
  } catch {
    return null;
  }
}

function heuristicSynthesize(successful: WorkerOutput[]): string {
  if (successful.length === 0) return "Keine Worker-Antwort verfügbar.";
  if (successful.length === 1) return successful[0]!.answer;

  const sorted = [...successful].sort((a, b) => b.answer.length - a.answer.length);
  const primary = sorted[0]!;
  const critic = sorted.slice(1).find((o) => o.role === "critic");

  if (!critic) return primary.answer;

  const sentences = critic.answer.split(/[.!?]\s+/);
  const critPoints: string[] = [];
  for (const s of sentences) {
    if (/risiko|fehler|problem|falsch|incorrect|error|concern|jedoch|aber\s+(?!auch)/i.test(s) && s.length > 20) {
      critPoints.push(s.trim());
    }
  }

  if (critPoints.length === 0) return primary.answer;
  return `${primary.answer}\n\n**Kritische Punkte:**\n${critPoints.map((p) => `- ${p}`).join("\n")}`;
}

export async function synthesizeWorkerOutputs(
  outputs: WorkerOutput[],
  userQuestion: string,
): Promise<SynthesisResult> {
  const start = Date.now();
  const successful = outputs.filter((o) => o.success && o.answer.trim().length > 0);

  if (successful.length === 0) {
    return { answer: "Keine Worker-Antwort verfügbar.", backend: "heuristic", model: "none", latencyMs: Date.now() - start };
  }

  if (successful.length === 1) {
    return { answer: successful[0]!.answer, backend: "heuristic", model: "none", latencyMs: Date.now() - start };
  }

  const qwenAnswer = await tryQwenSynthesis(successful, userQuestion);
  if (qwenAnswer) {
    return { answer: qwenAnswer, backend: "qwen", model: QWEN_MODEL, latencyMs: Date.now() - start };
  }

  return { answer: heuristicSynthesize(successful), backend: "heuristic", model: "none", latencyMs: Date.now() - start };
}
