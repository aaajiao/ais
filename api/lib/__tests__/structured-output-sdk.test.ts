// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { expandSearchQuery } from '../search-utils.js';
import { extractArtworkFromUrl } from '../artwork-extractor.js';

const { selectModel } = vi.hoisted(() => ({ selectModel: vi.fn() }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => selectModel }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => selectModel }));

function modelReturning(output: object) {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    },
  });
  selectModel.mockReturnValue(model);
  return model;
}

describe('AI SDK 7 structured output business paths', () => {
  beforeEach(() => {
    selectModel.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses Chinese material search expansion through the real SDK output schema', async () => {
    const model = modelReturning({ searchTerms: ['magnet', 'magnets', 'magnetic'] });

    expect(await expandSearchQuery('磁铁')).toEqual(['magnet', 'magnets', 'magnetic']);
    expect(selectModel).toHaveBeenCalledWith('claude-haiku-5-5');
    expect(model.doGenerateCalls[0].responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    // Claude 5 不传 thinking 就会以默认 effort 思考；搜索扩展在工具调用路径上，固定 low
    expect(model.doGenerateCalls[0].providerOptions).toEqual({
      anthropic: { thinking: { type: 'adaptive' }, effort: 'low' },
    });
  });

  it('falls back to the default expansion model for a stale stored model id', async () => {
    modelReturning({ searchTerms: ['wood'] });

    expect(await expandSearchQuery('木头', 'claude-haiku-4-5')).toEqual(['wood']);
    expect(selectModel).toHaveBeenCalledWith('claude-haiku-5-5');
  });

  it('keeps the original search term when model output fails schema validation', async () => {
    modelReturning({ searchTerms: 'not-an-array' });

    expect(await expandSearchQuery('磁铁')).toEqual(['磁铁']);
  });

  it('extracts an artwork through generateText and preserves nullable fields and page images', async () => {
    const artwork = {
      title_en: 'Guard I', title_cn: null, year: '2024', type: 'Installation',
      dimensions: null, materials: 'steel', duration: null,
      description_en: null, description_cn: null,
    };
    const model = modelReturning(artwork);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body><h1>Guard I</h1><p>2024 steel installation</p><img src="https://example.com/artwork.jpg"></body></html>',
    )));

    const result = await extractArtworkFromUrl('https://example.com/artwork', 'gpt-6.1-sol', 'en');

    expect(result).toMatchObject({ success: true, artwork, images: ['https://example.com/artwork.jpg'] });
    expect(selectModel).toHaveBeenCalledWith('gpt-6.1-sol');
    expect(model.doGenerateCalls[0].providerOptions).toEqual({
      openai: { reasoningEffort: 'low', reasoningSummary: null },
    });
    expect(model.doGenerateCalls[0].prompt[0]).toMatchObject({ role: 'system' });
    expect(model.doGenerateCalls[0].responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
