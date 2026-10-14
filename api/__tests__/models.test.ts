// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../models.js';

/**
 * 守护测试：/api/models 只列出 Claude 5.1 / 5.5 这一代与 GPT-6 系列（v1.10 起；v1.10.2 起去掉 5.0 代）。
 * provider 的 /v1/models 会同时返回旧模型、日期快照和非对话模型，这里只 mock fetch。
 */
const ANTHROPIC_MODELS = [
  { id: 'claude-fable-5-1', display_name: 'Claude Fable 5.1' },
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5', display_name: 'Claude Fable 5' },
  { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
  { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
  { id: 'claude-mythos-preview', display_name: 'Claude Mythos Preview' },
].map((model) => ({ ...model, created_at: '2026-09-28T00:00:00Z', type: 'model' }));

const OPENAI_MODELS = [
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-6.1-sol',
  'gpt-6-chat-latest',
  'gpt-5.5',
  'gpt-5.6-sol',
  'gpt-4o',
  'o3-mini',
  'gpt-realtime-2.1',
  'gpt-image-2.5-mini',
  'text-embedding-3-large',
].map((id) => ({ id, object: 'model', created: 1_790_000_000, owned_by: 'openai' }));

type ModelsBody = {
  anthropic: Array<{ id: string; name: string; description?: { en: string; zh: string } }>;
  openai: Array<{ id: string; name: string; description?: { en: string; zh: string } }>;
  defaultModel: string | null;
  defaultExpansionModel: string | null;
};

async function getModels(): Promise<ModelsBody> {
  const response = await handler(new Request('http://localhost/api/models'));
  expect(response.status).toBe(200);
  return response.json();
}

describe('GET /api/models', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const data = url.startsWith('https://api.anthropic.com/') ? ANTHROPIC_MODELS : OPENAI_MODELS;
        return new Response(JSON.stringify({ data }), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('lists only Claude 5.1 / 5.5 models (not the 5.0 generation or Claude 4)', async () => {
    const body = await getModels();
    expect(body.anthropic.map((model) => model.id).sort()).toEqual([
      'claude-fable-5-1',
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('lists only GPT-6 chat models, newest version first', async () => {
    const body = await getModels();
    expect(body.openai.map((model) => model.id)).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol']);
    expect(body.openai[0].name).toBe('GPT-6.1 Sol');
  });

  it('gives every listed model a description', async () => {
    const body = await getModels();
    for (const model of [...body.anthropic, ...body.openai]) {
      expect(model.description, model.id).toBeDefined();
    }
  });

  it('returns the Claude 5 defaults', async () => {
    const body = await getModels();
    expect(body.defaultModel).toBe('claude-sonnet-5-5');
    expect(body.defaultExpansionModel).toBe('claude-haiku-5-5');
  });

  it('requests up to 100 Anthropic models so Claude 5 is not cut by pagination', async () => {
    await getModels();
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/models?limit=100', expect.any(Object));
  });
});
