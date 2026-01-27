/**
 * Tests for useArtworksSelection hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useArtworksSelection } from './useArtworksSelection';

describe('useArtworksSelection', () => {
  describe('initial state', () => {
    it('starts with selectMode false', () => {
      const { result } = renderHook(() => useArtworksSelection());
      expect(result.current.selectMode).toBe(false);
    });

    it('starts with empty selectedIds', () => {
      const { result } = renderHook(() => useArtworksSelection());
      expect(result.current.selectedIds.size).toBe(0);
    });

    it('starts with selectedCount 0', () => {
      const { result } = renderHook(() => useArtworksSelection());
      expect(result.current.selectedCount).toBe(0);
    });

    it('starts with showDeleteConfirm false', () => {
      const { result } = renderHook(() => useArtworksSelection());
      expect(result.current.showDeleteConfirm).toBe(false);
    });

    it('starts with deleting false', () => {
      const { result } = renderHook(() => useArtworksSelection());
      expect(result.current.deleting).toBe(false);
    });
  });

  describe('toggleSelectMode', () => {
    it('toggles selectMode from false to true', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.toggleSelectMode();
      });

      expect(result.current.selectMode).toBe(true);
    });

    it('toggles selectMode from true to false', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.toggleSelectMode();
      });
      act(() => {
        result.current.toggleSelectMode();
      });

      expect(result.current.selectMode).toBe(false);
    });

    it('clears selectedIds when toggling', () => {
      const { result } = renderHook(() => useArtworksSelection());

      // First enable select mode and select some items
      act(() => {
        result.current.toggleSelectMode();
      });
      act(() => {
        result.current.selectAll(['id1', 'id2']);
      });

      expect(result.current.selectedIds.size).toBe(2);

      // Toggle off and back on
      act(() => {
        result.current.toggleSelectMode();
      });

      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('toggleSelect', () => {
    it('adds item to selection', () => {
      const { result } = renderHook(() => useArtworksSelection());
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.toggleSelect('id1', mockEvent);
      });

      expect(result.current.selectedIds.has('id1')).toBe(true);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('removes item from selection when already selected', () => {
      const { result } = renderHook(() => useArtworksSelection());
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.toggleSelect('id1', mockEvent);
      });
      act(() => {
        result.current.toggleSelect('id1', mockEvent);
      });

      expect(result.current.selectedIds.has('id1')).toBe(false);
    });

    it('can select multiple items', () => {
      const { result } = renderHook(() => useArtworksSelection());
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.toggleSelect('id1', mockEvent);
      });
      act(() => {
        result.current.toggleSelect('id2', mockEvent);
      });
      act(() => {
        result.current.toggleSelect('id3', mockEvent);
      });

      expect(result.current.selectedIds.size).toBe(3);
      expect(result.current.selectedCount).toBe(3);
    });
  });

  describe('selectAll', () => {
    it('selects all provided ids', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.selectAll(['id1', 'id2', 'id3']);
      });

      expect(result.current.selectedIds.size).toBe(3);
      expect(result.current.selectedIds.has('id1')).toBe(true);
      expect(result.current.selectedIds.has('id2')).toBe(true);
      expect(result.current.selectedIds.has('id3')).toBe(true);
    });

    it('replaces existing selection', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.selectAll(['id1', 'id2']);
      });
      act(() => {
        result.current.selectAll(['id3', 'id4', 'id5']);
      });

      expect(result.current.selectedIds.size).toBe(3);
      expect(result.current.selectedIds.has('id1')).toBe(false);
      expect(result.current.selectedIds.has('id3')).toBe(true);
    });
  });

  describe('deselectAll', () => {
    it('clears all selections', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.selectAll(['id1', 'id2', 'id3']);
      });
      act(() => {
        result.current.deselectAll();
      });

      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('setShowDeleteConfirm', () => {
    it('sets showDeleteConfirm to true', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.setShowDeleteConfirm(true);
      });

      expect(result.current.showDeleteConfirm).toBe(true);
    });

    it('sets showDeleteConfirm to false', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.setShowDeleteConfirm(true);
      });
      act(() => {
        result.current.setShowDeleteConfirm(false);
      });

      expect(result.current.showDeleteConfirm).toBe(false);
    });
  });

  describe('setDeleting', () => {
    it('sets deleting state', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.setDeleting(true);
      });

      expect(result.current.deleting).toBe(true);

      act(() => {
        result.current.setDeleting(false);
      });

      expect(result.current.deleting).toBe(false);
    });
  });

  describe('resetSelection', () => {
    it('clears selectedIds and disables selectMode', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.toggleSelectMode();
      });
      act(() => {
        result.current.selectAll(['id1', 'id2']);
      });

      expect(result.current.selectMode).toBe(true);
      expect(result.current.selectedIds.size).toBe(2);

      act(() => {
        result.current.resetSelection();
      });

      expect(result.current.selectMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('isSelected', () => {
    it('returns true for selected item', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.selectAll(['id1', 'id2']);
      });

      expect(result.current.isSelected('id1')).toBe(true);
      expect(result.current.isSelected('id2')).toBe(true);
    });

    it('returns false for unselected item', () => {
      const { result } = renderHook(() => useArtworksSelection());

      act(() => {
        result.current.selectAll(['id1', 'id2']);
      });

      expect(result.current.isSelected('id3')).toBe(false);
    });
  });

  describe('callback stability', () => {
    it('maintains stable callback references', () => {
      const { result, rerender } = renderHook(() => useArtworksSelection());

      const firstRender = {
        toggleSelectMode: result.current.toggleSelectMode,
        toggleSelect: result.current.toggleSelect,
        selectAll: result.current.selectAll,
        deselectAll: result.current.deselectAll,
        resetSelection: result.current.resetSelection,
      };

      rerender();

      expect(result.current.toggleSelectMode).toBe(firstRender.toggleSelectMode);
      expect(result.current.toggleSelect).toBe(firstRender.toggleSelect);
      expect(result.current.selectAll).toBe(firstRender.selectAll);
      expect(result.current.deselectAll).toBe(firstRender.deselectAll);
      expect(result.current.resetSelection).toBe(firstRender.resetSelection);
    });
  });
});
