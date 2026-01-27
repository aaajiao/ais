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

  describe('from terminal statuses', () => {
    const terminalStatuses: EditionStatus[] = ['sold', 'gifted', 'lost', 'damaged'];
    const allStatuses: EditionStatus[] = [
      'in_production', 'in_studio', 'at_gallery', 'at_museum',
      'in_transit', 'sold', 'gifted', 'lost', 'damaged'
    ];

    terminalStatuses.forEach(terminal => {
      allStatuses.forEach(target => {
        if (terminal !== target) {
          it(`should reject transition from ${terminal} to ${target}`, () => {
            expect(isValidTransition(terminal, target)).toBe(false);
          });
        }
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

  it('should return empty array for terminal statuses', () => {
    expect(getValidNextStatuses('sold')).toEqual([]);
    expect(getValidNextStatuses('gifted')).toEqual([]);
    expect(getValidNextStatuses('lost')).toEqual([]);
    expect(getValidNextStatuses('damaged')).toEqual([]);
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
