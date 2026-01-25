/**
 * 库存编号解析和建议工具
 */

export interface NumberPattern {
  pattern: string;           // 如 "AAJ-YYYY-NNN"
  prefix: string | null;     // 如 "AAJ"
  hasYear: boolean;          // 是否包含年份
  sequenceDigits: number;    // 序号位数
  separator: string;         // 分隔符
}

export interface NumberSuggestion {
  pattern: NumberPattern | null;
  nextNumber: string;
  existingCount: number;
  maxSequence: number;
}

/**
 * 分析现有编号的格式模式
 */
export function analyzeNumberPattern(existingNumbers: string[]): NumberPattern | null {
  if (existingNumbers.length === 0) return null;

  // 过滤掉空值
  const validNumbers = existingNumbers.filter(n => n && n.trim());
  if (validNumbers.length === 0) return null;

  // 尝试匹配常见模式
  const patterns = [
    // AAJ-2024-001 格式
    {
      regex: /^([A-Z]+)-(\d{4})-(\d{3,})$/,
      getPattern: (m: RegExpMatchArray) => ({
        pattern: `${m[1]}-YYYY-${'N'.repeat(m[3].length)}`,
        prefix: m[1],
        hasYear: true,
        sequenceDigits: m[3].length,
        separator: '-',
      }),
    },
    // AAJ-001 格式
    {
      regex: /^([A-Z]+)-(\d{3,})$/,
      getPattern: (m: RegExpMatchArray) => ({
        pattern: `${m[1]}-${'N'.repeat(m[2].length)}`,
        prefix: m[1],
        hasYear: false,
        sequenceDigits: m[2].length,
        separator: '-',
      }),
    },
    // 2024-001 格式
    {
      regex: /^(\d{4})-(\d{3,})$/,
      getPattern: (m: RegExpMatchArray) => ({
        pattern: `YYYY-${'N'.repeat(m[2].length)}`,
        prefix: null,
        hasYear: true,
        sequenceDigits: m[2].length,
        separator: '-',
      }),
    },
    // AAJ/2024/001 格式
    {
      regex: /^([A-Z]+)\/(\d{4})\/(\d{3,})$/,
      getPattern: (m: RegExpMatchArray) => ({
        pattern: `${m[1]}/YYYY/${'N'.repeat(m[3].length)}`,
        prefix: m[1],
        hasYear: true,
        sequenceDigits: m[3].length,
        separator: '/',
      }),
    },
    // 纯数字 001 格式
    {
      regex: /^(\d{3,})$/,
      getPattern: (m: RegExpMatchArray) => ({
        pattern: 'N'.repeat(m[1].length),
        prefix: null,
        hasYear: false,
        sequenceDigits: m[1].length,
        separator: '',
      }),
    },
  ];

  // 找到匹配最多的模式
  for (const { regex, getPattern } of patterns) {
    const matches = validNumbers.filter(n => regex.test(n));
    if (matches.length >= validNumbers.length * 0.5) {
      const match = regex.exec(matches[0]);
      if (match) {
        return getPattern(match);
      }
    }
  }

  return null;
}

/**
 * 获取编号中的序号
 */
function extractSequence(number: string, pattern: NumberPattern): number {
  // 根据模式提取序号部分
  const seqRegex = new RegExp(`(\\d{${pattern.sequenceDigits},})$`);
  const match = seqRegex.exec(number);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 获取编号中的年份
 */
function extractYear(number: string): number | null {
  const yearMatch = /\b(20\d{2})\b/.exec(number);
  return yearMatch ? parseInt(yearMatch[1], 10) : null;
}

/**
 * 生成下一个建议编号
 */
export function suggestNextNumber(
  existingNumbers: string[],
  currentYear: number = new Date().getFullYear()
): NumberSuggestion {
  const validNumbers = existingNumbers.filter(n => n && n.trim());
  const pattern = analyzeNumberPattern(validNumbers);

  if (!pattern) {
    // 没有识别到模式，使用默认格式
    return {
      pattern: null,
      nextNumber: `AAJ-${currentYear}-001`,
      existingCount: validNumbers.length,
      maxSequence: 0,
    };
  }

  // 找到最大序号
  let maxSequence = 0;
  let maxSequenceInCurrentYear = 0;

  for (const num of validNumbers) {
    const seq = extractSequence(num, pattern);
    maxSequence = Math.max(maxSequence, seq);

    if (pattern.hasYear) {
      const year = extractYear(num);
      if (year === currentYear) {
        maxSequenceInCurrentYear = Math.max(maxSequenceInCurrentYear, seq);
      }
    }
  }

  // 生成下一个编号
  let nextSeq: number;
  let nextYear: number | null = null;

  if (pattern.hasYear) {
    // 如果有年份，检查是否是新年
    const yearsInNumbers = validNumbers
      .map(n => extractYear(n))
      .filter((y): y is number => y !== null);
    const latestYear = yearsInNumbers.length > 0 ? Math.max(...yearsInNumbers) : currentYear;

    if (currentYear > latestYear) {
      // 新的一年，从 1 开始
      nextSeq = 1;
      nextYear = currentYear;
    } else {
      // 同一年，递增
      nextSeq = maxSequenceInCurrentYear + 1;
      nextYear = currentYear;
    }
  } else {
    // 没有年份，直接递增
    nextSeq = maxSequence + 1;
  }

  // 格式化编号
  const seqStr = nextSeq.toString().padStart(pattern.sequenceDigits, '0');
  let nextNumber: string;

  if (pattern.prefix && pattern.hasYear) {
    nextNumber = `${pattern.prefix}${pattern.separator}${nextYear}${pattern.separator}${seqStr}`;
  } else if (pattern.prefix) {
    nextNumber = `${pattern.prefix}${pattern.separator}${seqStr}`;
  } else if (pattern.hasYear) {
    nextNumber = `${nextYear}${pattern.separator}${seqStr}`;
  } else {
    nextNumber = seqStr;
  }

  return {
    pattern,
    nextNumber,
    existingCount: validNumbers.length,
    maxSequence,
  };
}

/**
 * 校验编号格式
 */
export function validateNumberFormat(
  number: string,
  pattern?: NumberPattern
): { valid: boolean; message?: string } {
  if (!number || !number.trim()) {
    return { valid: true }; // 空编号是允许的
  }

  // 基本格式检查
  if (number.length > 50) {
    return { valid: false, message: '编号过长' };
  }

  if (!/^[A-Za-z0-9\-\/\_]+$/.test(number)) {
    return { valid: false, message: '编号只能包含字母、数字和常用分隔符' };
  }

  // 如果有模式，检查是否符合
  if (pattern) {
    const suggestion = suggestNextNumber([number]);
    if (suggestion.pattern) {
      // 检查格式是否一致
      if (suggestion.pattern.pattern !== pattern.pattern) {
        return {
          valid: true,
          message: `格式与现有编号不一致 (期望: ${pattern.pattern})`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * 检查编号是否唯一
 */
export function isNumberUnique(
  number: string,
  existingNumbers: string[],
  excludeNumber?: string
): boolean {
  if (!number || !number.trim()) return true;

  const normalizedNumber = number.trim().toUpperCase();
  const normalizedExisting = existingNumbers
    .filter(n => n !== excludeNumber)
    .map(n => n?.trim().toUpperCase());

  return !normalizedExisting.includes(normalizedNumber);
}
