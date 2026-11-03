import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildPrompt, RESPONSE_SCHEMA, type AiInput } from './src/lib/ai';

/**
 * POST /ai/generate → 로컬 Ollama(/api/chat). 브라우저는 vite 서버만 부르고, Ollama 주소는 서버에만 있다.
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

function ollama(url: string, model: string): Plugin {
  const handle = (req: Req, res: Res) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'POST만 됩니다' });
    let raw = '';
    const dec = new TextDecoder();
    req.on('data', (c) => {
      raw += dec.decode(c, { stream: true });
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const r = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: buildPrompt(JSON.parse(raw) as AiInput) }],
            format: RESPONSE_SCHEMA,
            think: false,
            // 스트리밍: 안 하면 node fetch가 300초 안에 응답 헤더를 못 받아 끊는다
            stream: true,
            options: { num_ctx: 16384 },
            keep_alive: '30m',
          }),
          signal: AbortSignal.timeout(600_000),
        }).catch((e: Error) => e);
        if (r instanceof Error) return send(503, { error: `로컬 AI(${url})에 연결하지 못했습니다: ${r.cause instanceof Error ? r.cause.message : r.name}` });
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          console.error(`[ollama] ${r.status}`, data);
          return send(502, { error: `로컬 AI 오류: ${data?.error ?? r.status}` });
        }
        // 한 줄에 JSON 하나(NDJSON). message.content 조각을 이어 붙인다
        let content = '';
        let reason = '';
        for (const line of (await r.text()).split('\n')) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          if (chunk.error) return send(502, { error: `로컬 AI 오류: ${chunk.error}` });
          content += chunk.message?.content ?? '';
          if (chunk.done) reason = chunk.done_reason;
        }
        try {
          send(200, JSON.parse(content));
        } catch {
          console.error('[ollama] JSON이 아닌 응답', reason, content.slice(-300));
          send(502, { error: `로컬 AI 응답이 잘렸거나 JSON이 아닙니다 (done_reason ${reason || '없음'})` });
        }
      } catch (e) {
        console.error('[ollama]', e);
        send(502, { error: `생성 실패: ${(e as Error).message}` });
      }
    });
  };
  return {
    name: 'ollama',
    // 위 최소 타입과 node 타입을 맞추지 않으려고 never로 넘긴다
    configureServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
    configurePreviewServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'LLM_');
  return {
    plugins: [react(), tailwindcss(), ollama(env.LLM_BASE_URL || 'http://100.70.239.59:11434', env.LLM_MODEL || 'qwen3.5:9b')],
    server: {
      // 백엔드(Spring Boot) 연동 시 VITE_USE_MOCK=false 로 실행
      proxy: { '/api': 'http://localhost:8080' },
    },
  };
});
