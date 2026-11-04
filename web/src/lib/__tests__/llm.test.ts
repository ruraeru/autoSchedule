import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateJson, llmConfig } from '../llm';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('generateJson', () => {
  it('/api/chat에 Bearer·think·num_ctx를 넣고 스트림 content를 이어 붙여 파싱한다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"message":{"content":"{\\"ok\\""}}\n{"message":{"content":":1}"},"done":true}\n'));
    vi.stubGlobal('fetch', fetch);
    const cfg = llmConfig({ LLM_BASE_URL: 'https://ai.example/', LLM_API_KEY: 'k' });
    expect(await generateJson(cfg, 'p', {})).toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://ai.example/api/chat');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body)).toMatchObject({ think: false, stream: true, options: { num_ctx: 8192 } });
    expect(init.signal).toBeUndefined();
  });

  it('키가 없으면 Authorization을 보내지 않는다', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { message: { content: '{}' } }));
    vi.stubGlobal('fetch', fetch);
    await generateJson(llmConfig({}), 'p', {});
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});
