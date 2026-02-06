import { describe, it, expect } from 'vitest';
import { READ_ONLY_ACTIONS } from '../index';

describe('READ_ONLY_ACTIONS', () => {
  it('should contain exactly 5 read-only actions', () => {
    expect(READ_ONLY_ACTIONS).toHaveLength(5);
  });

  it('should contain all search tools', () => {
    expect(READ_ONLY_ACTIONS).toContain('search_artworks');
    expect(READ_ONLY_ACTIONS).toContain('search_editions');
    expect(READ_ONLY_ACTIONS).toContain('search_locations');
    expect(READ_ONLY_ACTIONS).toContain('search_history');
  });

  it('should contain statistics tool', () => {
    expect(READ_ONLY_ACTIONS).toContain('get_statistics');
  });

  it('should NOT contain write tools', () => {
    const writeTools = [
      'generate_update_confirmation',
      'execute_edition_update',
      'export_artworks',
      'import_artwork_from_url',
    ];
    for (const tool of writeTools) {
      expect(READ_ONLY_ACTIONS).not.toContain(tool);
    }
  });
});
