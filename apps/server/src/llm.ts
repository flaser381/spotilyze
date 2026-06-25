/**
 * Provider-agnostic LLM client for the background personality profile.
 * Configured entirely from env — works with any OpenAI-compatible endpoint
 * (OpenAI, Gemini's OpenAI URL, Groq, LM Studio, vLLM, LiteLLM…), Ollama, or
 * Anthropic's native messages API.
 *
 *   LLM_PROVIDER = openai | anthropic | ollama   (default openai)
 *   LLM_MODEL    = e.g. gpt-4o-mini, claude-..., llama3.1   (required to enable)
 *   LLM_API_KEY  = provider key (omit for Ollama / local)
 *   LLM_BASE_URL = override endpoint (e.g. http://localhost:11434/v1)
 */
export interface LLMSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}
export interface LLMConfig {
  provider: "openai" | "anthropic" | "ollama";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  ollama: "http://localhost:11434/v1",
};

/**
 * Inside a container, `localhost` is the container itself — a local model server
 * (Ollama, LM Studio, vLLM) runs on the host. When IN_DOCKER is set we rewrite
 * localhost/127.0.0.1 to host.docker.internal so the host is reachable.
 * (Linux needs `--add-host=host.docker.internal:host-gateway`; see docker-compose.yml.)
 */
function dockerizeHost(url: string): string {
  if (!Bun.env.IN_DOCKER) return url;
  return url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i, "//host.docker.internal");
}

/** Resolve effective config. Returns null (disabled) if no model, or no key when one is required. */
export function llmConfig(s: LLMSettings): LLMConfig | null {
  const provider = (s.provider || "openai").toLowerCase() as LLMConfig["provider"];
  const model = (s.model ?? "").trim();
  const apiKey = (s.apiKey ?? "").trim();
  const baseUrl = dockerizeHost(((s.baseUrl || "").trim() || DEFAULT_BASE[provider] || DEFAULT_BASE.openai)!.replace(/\/$/, ""));
  if (!model) return null;
  if (provider !== "ollama" && !apiKey) return null; // hosted providers need a key
  return { provider, baseUrl, apiKey, model };
}

/** One-shot chat completion. Throws on HTTP error. `json` forces a JSON response where supported. */
export async function llmChat(
  cfg: LLMConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 6000;
  if (cfg.provider === "anthropic") {
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const j = (await res.json()) as { content?: { text?: string }[] };
    return j.content?.map((c) => c.text ?? "").join("") ?? "";
  }

  if (cfg.provider === "ollama") {
    // native API so we can raise the context window (num_ctx) to fit the big prompt
    const host = cfg.baseUrl.replace(/\/v1\/?$/, "");
    const numCtx = Number(Bun.env.LLM_NUM_CTX ?? 24576); // big prompts (~8k tok) + a full answer overflow 16k → truncation
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        ...(opts.json ? { format: "json" } : {}),
        options: { num_ctx: numCtx, num_predict: maxTokens },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const j = (await res.json()) as { message?: { content?: string; thinking?: string } };
    return j.message?.content || j.message?.thinking || "";
  }

  // OpenAI-compatible (openai, gemini, groq, …)
  // Newer reasoning models reject max_tokens; use max_completion_tokens.
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.85,
      max_completion_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string; reasoning?: string } }[] };
  const msg = j.choices?.[0]?.message;
  // some reasoning models (e.g. gemma/qwen via Ollama) leave content empty and put
  // the text in `reasoning` — fall back to it
  return msg?.content || msg?.reasoning || "";
}
