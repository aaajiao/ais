/**
 * i18n 语言解析守护测试
 *
 * 契约（v1.8.6 起）：未登录的画廊访客按系统语言自动选语言。
 * - 中文系统（zh / zh-CN / zh-TW / zh-HK）→ 中文
 * - 其他任何系统（德 / 法 / 日 / 韩 / 英…）→ 英文，而非中文
 * - 手动选择写入 localStorage，detection.order 中 localStorage 优先，永远尊重
 *
 * 历史坑：`fallbackLng: 'zh'` 时，非中文系统的访客会被回退到中文（与期望相反）。
 * 修复用 supportedLngs + load:'languageOnly' + fallbackLng:['en','zh']。
 * 这里断言 resolvedLanguage（实际使用的语言），不耦合具体文案。
 */

import { describe, it, expect, afterAll } from 'vitest';
import i18n from '../index';

const original = i18n.language;

afterAll(async () => {
  // 还原，避免污染共享单例（test-utils 默认 zh）
  await i18n.changeLanguage(original);
});

describe('i18n language detection', () => {
  it('只声明 zh / en 两种支持语言', () => {
    expect(i18n.options.supportedLngs).toContain('zh');
    expect(i18n.options.supportedLngs).toContain('en');
    // supportedLngs 数组里 i18next 会附加 'cimode'，但不应有 de/fr 等
    expect(i18n.options.supportedLngs).not.toContain('de');
  });

  it('中文系统（含地区码）解析为中文', async () => {
    for (const lng of ['zh', 'zh-CN', 'zh-TW', 'zh-HK']) {
      await i18n.changeLanguage(lng);
      expect(i18n.resolvedLanguage).toBe('zh');
    }
  });

  it('英文系统（含地区码）解析为英文', async () => {
    for (const lng of ['en', 'en-US', 'en-GB']) {
      await i18n.changeLanguage(lng);
      expect(i18n.resolvedLanguage).toBe('en');
    }
  });

  it('非中文 / 非英文系统回退到英文，而不是中文', async () => {
    for (const lng of ['de-DE', 'fr-FR', 'ja-JP', 'ko-KR', 'es']) {
      await i18n.changeLanguage(lng);
      expect(i18n.resolvedLanguage).toBe('en');
    }
  });

  it('回退到英文时取到的是英文文案（不是中文）', async () => {
    await i18n.changeLanguage('de-DE');
    expect(i18n.t('common:confirm')).toBe('Confirm');
  });
});
