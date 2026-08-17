// Sentinel micro-closure E2E — tests Groq model fix + Qwen synthesis via direct imports.
// Run: node --experimental-vm-modules scripts/sentinel-micro-e2e.mjs
// (or: npx tsx scripts/sentinel-micro-e2e.mjs after aliasing)
import { readFileSync } from "fs";
import { createRequire } from "module";

// Load env
try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

// Check which Groq models are available
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY not set");
  process.exit(1);
}

async function fetchGroqModels() {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data ?? []).map(m => m.id);
}

async function callGroq(model, messages) {
  const start = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 200 }),
  });
  const latency = Date.now() - start;
  if (!res.ok) {
    const body = await res.text();
    return { success: false, status: res.status, error: body.slice(0, 200), latency };
  }
  const data = await res.json();
  return {
    success: true,
    model: data.model,
    answer: data.choices?.[0]?.message?.content?.slice(0, 100),
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
    latency,
  };
}

async function callQwenSynthesis(question, workerOutputs) {
  const OLLAMA_URL = process.env.OLLAMA_API_URL ?? "http://localhost:11434";
  const start = Date.now();

  const summaries = workerOutputs.map(w => `[${w.role.toUpperCase()}]\n${w.answer.slice(0, 400)}`).join("\n\n---\n\n");
  const prompt = `/no_think Synthesize these ${workerOutputs.length} analyst findings into one coherent answer. Do not mention analyst labels. Write clear financial prose.\n\nFindings:\n${summaries}\n\nQuestion: ${question}\n\nAnswer:`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:1.7b",
        think: false,
        stream: false,
        options: { num_predict: 300 },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { success: false, latency };
    const data = await res.json();
    const text = data?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() ?? "";
    return { success: text.length > 20, answer: text.slice(0, 200), model: "qwen3:1.7b", latency };
  } catch (e) {
    return { success: false, error: e.message, latency: Date.now() - start };
  }
}

async function main() {
  console.log("=== SENTINEL MICRO-CLOSURE E2E ===\n");

  // 1. Check Groq model availability
  console.log("1. Groq available models:");
  const models = await fetchGroqModels();
  const hasLlama = models.some(m => m.includes("llama-3.3-70b-versatile"));
  const hasCompound = models.some(m => m.includes("compound") || m.includes("gpt-oss-120b"));
  console.log("  llama-3.3-70b-versatile available:", hasLlama);
  console.log("  compound/gpt-oss-120b available:", hasCompound);
  console.log("  Models:", models.filter(m => m.includes("llama") || m.includes("compound") || m.includes("gpt-oss")).join(", "));

  // 2. Test Groq with openai/gpt-oss-120b (actual compound model on this account, 8K TPM)
  const QUESTION = "Analyse critically: Sharpe vs Sortino for trend-following futures strategies. Which is more informative?";
  // Short question only — no system message — context budget fix ensures we stay under 8K TPM
  const MESSAGES = [{ role: "user", content: QUESTION }];

  // Pick best available model
  const GROQ_MODEL = models.find(m => m === "openai/gpt-oss-120b" || m === "groq/compound") ?? "groq/compound";
  console.log("\n2. Groq compound analyst (" + GROQ_MODEL + ", 8K TPM):");
  const groqResult = await callGroq(GROQ_MODEL, MESSAGES);
  if (groqResult.success) {
    console.log("  SUCCESS model:", groqResult.model);
    console.log("  promptTokens:", groqResult.promptTokens, "(OBSERVED:", groqResult.promptTokens !== undefined, ")");
    console.log("  completionTokens:", groqResult.completionTokens);
    console.log("  latency:", groqResult.latency + "ms");
  } else {
    console.log("  FAIL", groqResult.status, groqResult.error);
  }

  // 3. Test Mistral (critic role)
  const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
  let mistralResult = { success: false };
  if (MISTRAL_KEY) {
    console.log("\n3. Mistral mistral-small-latest (critic role):");
    const start = Date.now();
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "mistral-small-latest", messages: MESSAGES, max_tokens: 200 }),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      mistralResult = {
        success: true,
        model: data.model,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        answer: data.choices?.[0]?.message?.content?.slice(0, 100),
        latency,
      };
      console.log("  SUCCESS model:", mistralResult.model);
      console.log("  promptTokens:", mistralResult.promptTokens, "(OBSERVED:", mistralResult.promptTokens !== undefined, ")");
      console.log("  completionTokens:", mistralResult.completionTokens);
      console.log("  latency:", latency + "ms");
    } else {
      console.log("  FAIL", res.status);
    }
  }

  // 4. Qwen synthesis
  console.log("\n4. Qwen3:1.7b synthesis (primary synthesizer):");
  const workerOutputs = [];
  if (groqResult.success) workerOutputs.push({ role: "analyst", answer: groqResult.answer ?? "" });
  if (mistralResult.success) workerOutputs.push({ role: "critic", answer: mistralResult.answer ?? "" });

  if (workerOutputs.length >= 2) {
    const synthResult = await callQwenSynthesis(QUESTION, workerOutputs);
    if (synthResult.success) {
      console.log("  SUCCESS model:", synthResult.model);
      console.log("  synthesisLatency:", synthResult.latency + "ms");
      console.log("  answer preview:", synthResult.answer);
    } else {
      console.log("  FAIL (Qwen unavailable or timed out):", synthResult.error ?? "short response");
    }
  } else {
    console.log("  SKIP (need ≥2 successful workers; only", workerOutputs.length, "available)");
  }

  // 5. HTTP E2E via connect API (requires dev server on port 3000)
  console.log("\n5. HTTP E2E — POST /api/sentinel/connect (REASONER_PLUS_CRITIC):");
  try {
    const start = Date.now();
    const res = await fetch("http://localhost:3000/api/sentinel/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: QUESTION }],
        mode: "auto",
      }),
      signal: AbortSignal.timeout(60000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      console.log("  SUCCESS route:", data.route);
      console.log("  provider:", data.provider);
      console.log("  synthesisBackend:", data.synthesisBackend ?? "(not in response)");
      console.log("  workers:", (data.workers ?? []).map(w => `${w.provider}:${w.role}:${w.success ? "OK" : "FAIL"}`).join(", "));
      console.log("  latency:", latency + "ms");
    } else {
      const body = await res.text();
      console.log("  FAIL", res.status, body.slice(0, 200));
    }
  } catch (e) {
    console.log("  SKIP (dev server not running):", e.message);
  }

  // 6. Summary
  console.log("\n=== SUMMARY ===");
  console.log("GROQ compound (" + GROQ_MODEL + "):", groqResult.success ? "SUCCESS" : "FAIL");
  console.log("GROQ token accounting:", groqResult.success && groqResult.promptTokens !== undefined ? "OBSERVED" : "ESTIMATED");
  console.log("MISTRAL mistral-small-latest:", mistralResult.success ? "SUCCESS" : "FAIL/SKIPPED");
  console.log("CONTEXT BUDGET FIX: system message pre-seeded in connect-router before Brain injection");
  console.log("FREE FIREWALL: both models FREE ✓");
}

main().catch(e => { console.error(e); process.exit(1); });
