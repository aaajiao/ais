/**
 * i18n parity test for login namespace
 *
 * Login 页面 + useAuth 认证错误文案都放在 `login` 命名空间，zh / en 必须 key 全等。
 * 漏写一边会让 t() 返回 key 字面量（如 "login:errors.unauthorized"）泄漏到 UI。
 *
 * 同模式见 backup-parity.test.ts / visualize-parity.test.ts。
 */

import { describe, it, expect } from 'vitest';
import zh from '../zh/login.json';
import en from '../en/login.json';

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

describe('login i18n parity', () => {
  it('zh / en 拥有完全相同的 key 集合', () => {
    const zhKeys = flatten(zh);
    const enKeys = flatten(en);

    expect(zhKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !zhKeys.includes(k))).toEqual([]);
  });

  it('覆盖 useAuth 设置的全部认证错误码', () => {
    // 来源：src/hooks/useAuth.ts 的 authError('xxx') 调用点
    const requiredErrorCodes = [
      'unauthorized',
      'initFailed',
      'sessionExpired',
      'signInFailed',
      'signOutFailed',
    ];
    const zhKeys = flatten(zh);
    const enKeys = flatten(en);
    for (const code of requiredErrorCodes) {
      const path = `errors.${code}`;
      expect(zhKeys, `zh missing ${path}`).toContain(path);
      expect(enKeys, `en missing ${path}`).toContain(path);
    }
  });
});
