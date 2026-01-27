/**
 * Artworks selection hook
 * Manages selection mode, selected items state, and delete confirmation
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseArtworksSelectionReturn {
  // Selection state
  selectMode: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  // Delete confirmation state
  showDeleteConfirm: boolean;
  deleting: boolean;
  // Actions
  toggleSelectMode: () => void;
  toggleSelect: (id: string, e: React.MouseEvent) => void;
  selectAll: (ids: string[]) => void;
  deselectAll: () => void;
  setShowDeleteConfirm: (show: boolean) => void;
  setDeleting: (deleting: boolean) => void;
  resetSelection: () => void;
  isSelected: (id: string) => boolean;
}

export function useArtworksSelection(): UseArtworksSelectionReturn {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Toggle selection mode (using functional setState)
  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  }, []);

  // Toggle individual item selection (using functional setState)
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Select all items
  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  // Deselect all items
  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Reset all selection state
  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  // Check if item is selected
  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectMode,
    selectedIds,
    selectedCount,
    showDeleteConfirm,
    deleting,
    toggleSelectMode,
    toggleSelect,
    selectAll,
    deselectAll,
    setShowDeleteConfirm,
    setDeleting,
    resetSelection,
    isSelected,
  };
}
