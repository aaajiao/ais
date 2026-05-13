import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  isTerminalStatus,
  getValidNextStatuses,
  requiresLocation,
  getTerminalStatuses,
  getLocationRequiredStatuses,
} from './editionStatus';
import type { EditionStatus } from './types';

describe('isValidTransition', () => {
  describe('from in_production', () => {
    it('should allow transition to in_studio', () => {
      expect(isValidTransition('in_production', 'in_studio')).toBe(true);
    });

    it('should allow transition to damaged', () => {
      expect(isValidTransition('in_production', 'damaged')).toBe(true);
    });

    it('should reject transition to at_gallery', () => {
      expect(isValidTransition('in_production', 'at_gallery')).toBe(false);
    });

    it('should reject transition to sold', () => {
      expect(isValidTransition('in_production', 'sold')).toBe(false);
    });
  });

  describe('from in_studio', () => {
    it('should allow transition to at_gallery', () => {
      expect(isValidTransition('in_studio', 'at_gallery')).toBe(true);
    });

    it('should allow transition to at_museum', () => {
      expect(isValidTransition('in_studio', 'at_museum')).toBe(true);
    });

    it('should allow transition to in_transit', () => {
      expect(isValidTransition('in_studio', 'in_transit')).toBe(true);
    });

    it('should allow transition to sold', () => {
      expect(isValidTransition('in_studio', 'sold')).toBe(true);
    });

    it('should allow transition to gifted', () => {
      expect(isValidTransition('in_studio', 'gifted')).toBe(true);
    });

    it('should allow transition to lost', () => {
      expect(isValidTransition('in_studio', 'lost')).toBe(true);
    });

    it('should allow transition to damaged', () => {
      expect(isValidTransition('in_studio', 'damaged')).toBe(true);
    });

    it('should reject transition to in_production', () => {
      expect(isValidTransition('in_studio', 'in_production')).toBe(false);
    });
  });

  describe('from at_gallery', () => {
    it('should allow transition to in_studio', () => {
      expect(isValidTransition('at_gallery', 'in_studio')).toBe(true);
    });

    it('should allow transition to in_transit', () => {
      expect(isValidTransition('at_gallery', 'in_transit')).toBe(true);
    });

    it('should allow transition to sold', () => {
      expect(isValidTransition('at_gallery', 'sold')).toBe(true);
    });

    it('should reject transition to at_museum directly', () => {
      expect(isValidTransition('at_gallery', 'at_museum')).toBe(false);
    });

    it('should reject transition to in_production', () => {
      expect(isValidTransition('at_gallery', 'in_production')).toBe(false);
    });
  });

  describe('from at_museum', () => {
    it('should allow transition to in_studio', () => {
      expect(isValidTransition('at_museum', 'in_studio')).toBe(true);
    });

    it('should allow transition to in_transit', () => {
      expect(isValidTransition('at_museum', 'in_transit')).toBe(true);
    });

    it('should reject transition to at_gallery directly', () => {
      expect(isValidTransition('at_museum', 'at_gallery')).toBe(false);
    });
  });

  describe('from in_transit', () => {
    it('should allow transition to in_studio', () => {
      expect(isValidTransition('in_transit', 'in_studio')).toBe(true);
    });

    it('should allow transition to at_gallery', () => {
      expect(isValidTransition('in_transit', 'at_gallery')).toBe(true);
    });

    it('should allow transition to at_museum', () => {
      expect(isValidTransition('in_transit', 'at_museum')).toBe(true);
    });

    it('should allow transition to lost', () => {
      expect(isValidTransition('in_transit', 'lost')).toBe(true);
    });

    it('should allow transition to damaged', () => {
      expect(isValidTransition('in_transit', 'damaged')).toBe(true);
    });

    it('should reject transition to sold', () => {
      expect(isValidTransition('in_transit', 'sold')).toBe(false);
    });
  });

  describe('from terminal statuses (UI 纠错放宽矩阵)', () => {
    // 业务终态仍是终态（isTerminalStatus === true），但 UI 编辑允许"纠正"。
    // 矩阵详见 lib/editionStatus.ts 中各终态条目。

    describe('from sold', () => {
      it('should allow correction back to in_studio', () => {
        expect(isValidTransition('sold', 'in_studio')).toBe(true);
      });
      it('should allow correction to gifted (登记错误)', () => {
        expect(isValidTransition('sold', 'gifted')).toBe(true);
      });
      it('should allow transition to lost / damaged', () => {
        expect(isValidTransition('sold', 'lost')).toBe(true);
        expect(isValidTransition('sold', 'damaged')).toBe(true);
      });
      it('should reject non-correction transitions', () => {
        expect(isValidTransition('sold', 'in_production')).toBe(false);
        expect(isValidTransition('sold', 'at_gallery')).toBe(false);
        expect(isValidTransition('sold', 'at_museum')).toBe(false);
        expect(isValidTransition('sold', 'in_transit')).toBe(false);
      });
    });

    describe('from gifted', () => {
      it('should allow correction back to in_studio', () => {
        expect(isValidTransition('gifted', 'in_studio')).toBe(true);
      });
      it('should allow correction to sold (登记错误)', () => {
        expect(isValidTransition('gifted', 'sold')).toBe(true);
      });
      it('should allow transition to lost / damaged', () => {
        expect(isValidTransition('gifted', 'lost')).toBe(true);
        expect(isValidTransition('gifted', 'damaged')).toBe(true);
      });
      it('should reject non-correction transitions', () => {
        expect(isValidTransition('gifted', 'in_production')).toBe(false);
        expect(isValidTransition('gifted', 'at_gallery')).toBe(false);
        expect(isValidTransition('gifted', 'at_museum')).toBe(false);
        expect(isValidTransition('gifted', 'in_transit')).toBe(false);
      });
    });

    describe('from lost', () => {
      it('should allow recovery to in_studio', () => {
        expect(isValidTransition('lost', 'in_studio')).toBe(true);
      });
      it('should allow transition to damaged', () => {
        expect(isValidTransition('lost', 'damaged')).toBe(true);
      });
      it('should reject transitions back to sold / gifted (寻回后需先回 in_studio 再走流程)', () => {
        expect(isValidTransition('lost', 'sold')).toBe(false);
        expect(isValidTransition('lost', 'gifted')).toBe(false);
      });
      it('should reject other transitions', () => {
        expect(isValidTransition('lost', 'in_production')).toBe(false);
        expect(isValidTransition('lost', 'at_gallery')).toBe(false);
        expect(isValidTransition('lost', 'at_museum')).toBe(false);
        expect(isValidTransition('lost', 'in_transit')).toBe(false);
      });
    });

    describe('from damaged', () => {
      it('should allow recovery to in_studio (修复后)', () => {
        expect(isValidTransition('damaged', 'in_studio')).toBe(true);
      });
      it('should reject all other transitions (损坏后需先回 in_studio 再走流程)', () => {
        expect(isValidTransition('damaged', 'in_production')).toBe(false);
        expect(isValidTransition('damaged', 'at_gallery')).toBe(false);
        expect(isValidTransition('damaged', 'at_museum')).toBe(false);
        expect(isValidTransition('damaged', 'in_transit')).toBe(false);
        expect(isValidTransition('damaged', 'sold')).toBe(false);
        expect(isValidTransition('damaged', 'gifted')).toBe(false);
        expect(isValidTransition('damaged', 'lost')).toBe(false);
      });
    });
  });

  describe('same status transition', () => {
    const allStatuses: EditionStatus[] = [
      'in_production', 'in_studio', 'at_gallery', 'at_museum',
      'in_transit', 'sold', 'gifted', 'lost', 'damaged'
    ];

    allStatuses.forEach(status => {
      it(`should reject transition from ${status} to itself`, () => {
        expect(isValidTransition(status, status)).toBe(false);
      });
    });
  });
});

describe('isTerminalStatus', () => {
  it('should return true for sold', () => {
    expect(isTerminalStatus('sold')).toBe(true);
  });

  it('should return true for gifted', () => {
    expect(isTerminalStatus('gifted')).toBe(true);
  });

  it('should return true for lost', () => {
    expect(isTerminalStatus('lost')).toBe(true);
  });

  it('should return true for damaged', () => {
    expect(isTerminalStatus('damaged')).toBe(true);
  });

  it('should return false for in_production', () => {
    expect(isTerminalStatus('in_production')).toBe(false);
  });

  it('should return false for in_studio', () => {
    expect(isTerminalStatus('in_studio')).toBe(false);
  });

  it('should return false for at_gallery', () => {
    expect(isTerminalStatus('at_gallery')).toBe(false);
  });

  it('should return false for at_museum', () => {
    expect(isTerminalStatus('at_museum')).toBe(false);
  });

  it('should return false for in_transit', () => {
    expect(isTerminalStatus('in_transit')).toBe(false);
  });
});

describe('getValidNextStatuses', () => {
  it('should return correct statuses for in_production', () => {
    const result = getValidNextStatuses('in_production');
    expect(result).toEqual(['in_studio', 'damaged']);
  });

  it('should return all possible destinations for in_studio', () => {
    const result = getValidNextStatuses('in_studio');
    expect(result).toContain('at_gallery');
    expect(result).toContain('at_museum');
    expect(result).toContain('in_transit');
    expect(result).toContain('sold');
    expect(result).toContain('gifted');
    expect(result).toContain('lost');
    expect(result).toContain('damaged');
    expect(result).not.toContain('in_production');
    expect(result).toHaveLength(7);
  });

  it('should return correction matrix for terminal statuses (UI 纠错用)', () => {
    // 业务终态 UI 允许纠正回 in_studio 或在终态间切换
    expect(getValidNextStatuses('sold')).toEqual(['in_studio', 'gifted', 'lost', 'damaged']);
    expect(getValidNextStatuses('gifted')).toEqual(['in_studio', 'sold', 'lost', 'damaged']);
    expect(getValidNextStatuses('lost')).toEqual(['in_studio', 'damaged']);
    expect(getValidNextStatuses('damaged')).toEqual(['in_studio']);
  });

  it('should return a new array (not reference)', () => {
    const result1 = getValidNextStatuses('in_studio');
    const result2 = getValidNextStatuses('in_studio');
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });
});

describe('requiresLocation', () => {
  it('should return true for in_studio', () => {
    expect(requiresLocation('in_studio')).toBe(true);
  });

  it('should return true for at_gallery', () => {
    expect(requiresLocation('at_gallery')).toBe(true);
  });

  it('should return true for at_museum', () => {
    expect(requiresLocation('at_museum')).toBe(true);
  });

  it('should return false for in_production', () => {
    expect(requiresLocation('in_production')).toBe(false);
  });

  it('should return false for in_transit', () => {
    expect(requiresLocation('in_transit')).toBe(false);
  });

  it('should return false for sold', () => {
    expect(requiresLocation('sold')).toBe(false);
  });

  it('should return false for gifted', () => {
    expect(requiresLocation('gifted')).toBe(false);
  });

  it('should return false for lost', () => {
    expect(requiresLocation('lost')).toBe(false);
  });

  it('should return false for damaged', () => {
    expect(requiresLocation('damaged')).toBe(false);
  });
});

describe('getTerminalStatuses', () => {
  it('should return all terminal statuses', () => {
    const result = getTerminalStatuses();
    expect(result).toContain('sold');
    expect(result).toContain('gifted');
    expect(result).toContain('lost');
    expect(result).toContain('damaged');
    expect(result).toHaveLength(4);
  });

  it('should return a new array (not reference)', () => {
    const result1 = getTerminalStatuses();
    const result2 = getTerminalStatuses();
    expect(result1).not.toBe(result2);
  });
});

describe('getLocationRequiredStatuses', () => {
  it('should return all location-required statuses', () => {
    const result = getLocationRequiredStatuses();
    expect(result).toContain('in_studio');
    expect(result).toContain('at_gallery');
    expect(result).toContain('at_museum');
    expect(result).toHaveLength(3);
  });

  it('should return a new array (not reference)', () => {
    const result1 = getLocationRequiredStatuses();
    const result2 = getLocationRequiredStatuses();
    expect(result1).not.toBe(result2);
  });
});
