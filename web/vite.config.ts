import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildPrompt, RESPONSE_SCHEMA, type AiInput } from './src/lib/ai';
import { generateJson, llmConfig, LlmError, type LlmConfig } from './src/lib/llm';

/**
 * POST /ai/generate → LLM 어댑터(src/lib/llm.ts). 브라우저는 vite 서버만 부르고, AI 주소·키는 서버에만 있다.
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

function aiGenerate(cfg: LlmConfig): Plugin {
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
        send(200, await generateJson(cfg, buildPrompt(JSON.parse(raw) as AiInput), RESPONSE_SCHEMA));
      } catch (e) {
        if (e instanceof LlmError) return send(e.status, { error: e.message });
        console.error('[llm]', e);
        send(502, { error: `생성 실패: ${(e as Error).message}` });
      }
    });
  };
  return {
    name: 'ai-generate',
    // 위 최소 타입과 node 타입을 맞추지 않으려고 never로 넘긴다
    configureServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
    configurePreviewServer: (s) => void s.middlewares.use('/ai/generate', handle as never),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'LLM_');
  return {
    plugins: [react(), tailwindcss(), aiGenerate(llmConfig(env))],
    server: {
      // 백엔드(Spring Boot) 연동 시 VITE_USE_MOCK=false 로 실행
      proxy: { '/api': 'http://localhost:8080' },
    },
  };
});
