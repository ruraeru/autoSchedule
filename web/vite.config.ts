import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildPrompt, RESPONSE_SCHEMA, type AiInput } from './src/lib/ai';

/**
 * POST /ai/generate → Gemini. 키는 서버(dev/preview)에만 있고 브라우저 번들에는 들어가지 않는다.
 * shortcut: vite dev/preview 서버에서만 동작. 배포하려면 같은 일을 백엔드(Spring Boot)에서 해야 한다.
 */
// @types/node 없이 쓰는 최소 타입
interface Req {
  method?: string;
  on(event: 'data' | 'end', cb: (chunk?: Uint8Array) => void): void;
  destroy(): void;
}
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

/** 과부하·한도 초과처럼 잠시 뒤 다시 하면 되는 오류 */
const RETRYABLE = new Set([429, 500, 503, 504]);

function gemini(key: string | undefined, models: string[]): Plugin {
  const handle = (req: Req, res: Res) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'POST만 됩니다' });
    if (!key) return send(500, { error: 'GEMINI_API_KEY가 없습니다. web/.env.local에 넣어 주세요.' });
    let raw = '';
    const dec = new TextDecoder();
    req.on('data', (c) => {
      raw += dec.decode(c, { stream: true });
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const body = JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(JSON.parse(raw) as AiInput) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        });
        // 과부하·시간 초과면 다음 모델로 넘어간다
        let last = '';
        for (const model of models) {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body,
            signal: AbortSignal.timeout(150_000),
          }).catch((e: Error) => e);
          if (r instanceof Error) {
            last = `${model}: 응답 없음 (${r.name})`;
            continue;
          }
          const data = await r.json().catch(() => null);
          if (r.ok) {
            const cand = data?.candidates?.[0];
            const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
            try {
              return send(200, JSON.parse(text));
            } catch {
              // 출력이 잘렸거나(MAX_TOKENS) 비었으면 다음 모델로
              last = `${model}: JSON이 아닌 응답 (finishReason ${cand?.finishReason ?? '없음'})`;
              console.error(`[gemini] ${last}`);
              continue;
            }
          }
          last = `${model}: ${data?.error?.message ?? r.status}`;
          console.error(`[gemini] ${r.status} ${last}`);
          if (!RETRYABLE.has(r.status)) return send(502, { error: `Gemini 오류: ${last}` });
        }
        send(503, { error: `Gemini가 지금 붐벼요. 잠시 후 다시 시도하세요. (${last})` });
      } catch (e) {
        console.error('[gemini]', e);
        send(502, { error: `생성 실패: ${(e as Error).message}` });
      }
    });
  };
  return {
    name: 'gemini',
    // 위 최소 타입과 node 타입을 맞추지 않으려고 never로 넘긴다
    configureServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
    configurePreviewServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'GEMINI_');
  return {
    plugins: [react(), tailwindcss(), gemini(
        env.GEMINI_API_KEY,
        // 앞 모델이 붐비면 뒤 모델로 넘어간다. 쉼표로 여러 개
        (env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean),
      )],
    server: {
      // 백엔드(Spring Boot) 연동 시 VITE_USE_MOCK=false 로 실행
      proxy: { '/api': 'http://localhost:8080' },
    },
  };
});
