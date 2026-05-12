import { describe, it, expect } from 'vitest';
import zh from '../zh/visualize.json';
import en from '../en/visualize.json';

// 把嵌套 i18n JSON 拍平成 'a.b.c' 路径集合
function flatten(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flatten(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('visualize i18n parity', () => {
  it('zh / en 拥有完全相同的 key 集合', () => {
    const zhKeys = flatten(zh);
    const enKeys = flatten(en);

    const onlyInZh = zhKeys.filter((k) => !enKeys.includes(k));
    const onlyInEn = enKeys.filter((k) => !zhKeys.includes(k));

    expect(onlyInZh).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('两份都覆盖了 4 个 view 的核心段', () => {
    const expectedSections = [
      'view.strata',
      'view.markets',
      'view.terminal',
      'view.diaspora',
      'strata.heading',
      'markets.heading',
      'terminal.heading',
      'diaspora.heading',
    ];
    const zhKeys = flatten(zh);
    for (const section of expectedSections) {
      expect(zhKeys).toContain(section);
    }
  });
});
