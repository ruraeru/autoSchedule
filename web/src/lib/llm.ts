/**
 * LLM 어댑터. 서버 전용: vite 서버 미들웨어(vite.config.ts)에서만 부른다. 브라우저 코드에서 import하면 키가 번들에 들어갈 수 있다.
 * Ollama 호환 서버(LLM_BASE_URL)의 /api/chat을 부른다. LLM_API_KEY가 있으면 Bearer 헤더를 붙인다.
 */

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** 호출자에게 돌려줄 HTTP 상태를 담은 오류 */
export class LlmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** loadEnv 결과에서 설정을 만든다 */
export function llmConfig(env: Record<string, string | undefined>): LlmConfig {
  return {
    baseUrl: (env.LLM_BASE_URL || 'https://ai.ruraeru.xyz').replace(/\/+$/, ''),
    model: env.LLM_MODEL || 'qwen3.5:9b',
    apiKey: env.LLM_API_KEY || undefined,
  };
}

/** prompt를 보내고 schema에 맞춘 JSON 응답을 파싱해 돌려준다. 실패하면 LlmError. 제한 시간은 없다 */
export async function generateJson(cfg: LlmConfig, prompt: string, schema: object): Promise<unknown> {
  const r = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey && { Authorization: `Bearer ${cfg.apiKey}` }) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      format: schema,
      think: false,
      // 스트리밍: 안 하면 node fetch가 300초 안에 응답 헤더를 못 받아 끊는다
      stream: true,
      options: { num_ctx: 8192 },
      keep_alive: '30m',
    }),
  }).catch((e: Error) => e);
  if (r instanceof Error) {
    throw new LlmError(503, `AI 서버(${cfg.baseUrl})에 연결하지 못했습니다: ${r.cause instanceof Error ? r.cause.message : r.name}`);
  }
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    console.error(`[llm] ${r.status}`, data);
    throw new LlmError(502, `AI 오류: ${data?.error ?? r.status}`);
  }
  // 한 줄에 JSON 하나(NDJSON). message.content 조각을 이어 붙인다
  let content = '';
  let reason = '';
  for (const line of (await r.text()).split('\n')) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new LlmError(502, `AI 오류: ${chunk.error}`);
    content += chunk.message?.content ?? '';
    if (chunk.done) reason = chunk.done_reason;
  }
  try {
    return JSON.parse(content);
  } catch {
    console.error('[llm] JSON이 아닌 응답', reason, content.slice(-300));
    throw new LlmError(502, `AI 응답이 잘렸거나 JSON이 아닙니다 (done_reason ${reason || '없음'})`);
  }
}
