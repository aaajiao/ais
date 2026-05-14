/**
 * i18n parity test for backup namespace
 *
 * Backup UI 把所有文案放在 `backup` 命名空间下，zh / en 必须 key 全等。
 * 任何一边新增 / 改名而另一边漏写，组件 t() 会返回 key 字面量，
 * 在 production 表现为 "backup.settings.foo.bar" 这种生字符串泄漏到 UI。
 *
 * 同样的模式见 src/locales/__tests__/visualize-parity.test.ts —— 历史教训证明
 * 跨命名空间 i18n 漂移是 ticking bomb，每个共享命名空间都该有 parity 守护。
 */

import { describe, it, expect } from 'vitest';
import zh from '../zh/backup.json';
import en from '../en/backup.json';

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

describe('backup i18n parity', () => {
  it('zh / en 拥有完全相同的 key 集合', () => {
    const zhKeys = flatten(zh);
    const enKeys = flatten(en);

    const onlyInZh = zhKeys.filter((k) => !enKeys.includes(k));
    const onlyInEn = enKeys.filter((k) => !zhKeys.includes(k));

    expect(onlyInZh).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('两份都覆盖了 settings / import 两段核心 UX', () => {
    const expectedSections = [
      'settings.title',
      'settings.frequency',
      'import.upload',
      'import.preview',
      'import.result',
      'import.errors',
    ];
    const zhKeys = flatten(zh);
    // 至少每段下都有 key（前缀匹配）
    for (const section of expectedSections) {
      const hasKey = zhKeys.some((k) => k === section || k.startsWith(`${section}.`));
      expect(hasKey, `missing section: ${section}`).toBe(true);
    }
  });

  it('错误码 key 覆盖全部服务端 + 客户端校验路径', () => {
    // 服务端会返这些 error code：见 api/import/backup.ts
    // 客户端 BackupUploadStep 还会返这些自己解析失败的 code：invalid_zip / no_manifest / manifest_parse_failed
    const requiredErrorCodes = [
      'cross_account',
      'schema_mismatch',
      'format_mismatch',
      'rollback_required',
      'no_backup',
      'invalid_zip',
      'no_manifest',
      'manifest_parse_failed',
    ];
    const zhKeys = flatten(zh);
    const enKeys = flatten(en);
    for (const code of requiredErrorCodes) {
      const path = `import.errors.${code}`;
      expect(zhKeys, `zh missing ${path}`).toContain(path);
      expect(enKeys, `en missing ${path}`).toContain(path);
    }
  });
});
