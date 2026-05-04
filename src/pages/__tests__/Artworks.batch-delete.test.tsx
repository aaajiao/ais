import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const updateMock = vi.fn();
const inMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('@/lib/cacheInvalidation', () => ({
  invalidateOnArtworkCreate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 't@example.com' } }),
}));

vi.mock('@/components/export/ExportDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="export-dialog" /> : null,
}));

vi.mock('@/hooks/queries/useArtworks', () => ({
  useArtworksQueryFn: () => () => Promise.resolve({ data: [], nextCursor: null }),
  useArtworksTotalCount: () => ({ data: 2 }),
}));

const refetchMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useInfiniteVirtualList', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useInfiniteVirtualList')>(
    '@/hooks/useInfiniteVirtualList'
  );
  return {
    ...actual,
    useInfiniteVirtualList: () => {
      const items = [
        {
          id: 'artwork-1',
          title_en: 'Guard',
          title_cn: '守卫',
          year: '2024',
          type: 'Installation',
          materials: null,
          dimensions: null,
          duration: null,
          thumbnail_url: null,
          edition_total: 3,
          ap_total: 0,
          is_unique: false,
          source_url: null,
          notes: null,
          deleted_at: null,
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          editions: [],
        },
        {
          id: 'artwork-2',
          title_en: 'Mirror',
          title_cn: '镜',
          year: '2024',
          type: 'Video',
          materials: null,
          dimensions: null,
          duration: null,
          thumbnail_url: null,
          edition_total: 1,
          ap_total: 0,
          is_unique: false,
          source_url: null,
          notes: null,
          deleted_at: null,
          created_at: '2024-02-01T00:00:00Z',
          updated_at: '2024-02-01T00:00:00Z',
          editions: [],
        },
      ];
      return {
        items,
        flattenedItems: [],
        totalLoaded: items.length,
        isLoading: false,
        isFetchingNextPage: false,
        error: null,
        hasNextPage: false,
        virtualizer: {
          getTotalSize: () => 0,
          getVirtualItems: () => [],
          measureElement: () => {},
        },
        parentRef: { current: null },
        fetchNextPage: vi.fn(),
        refetch: refetchMock,
      };
    },
  };
});

import { renderWithClient } from '@/test/test-utils';
import Artworks from '../Artworks';

beforeEach(() => {
  updateMock.mockReset();
  inMock.mockReset();
  fromMock.mockReset();
  refetchMock.mockClear();
  fromMock.mockReturnValue({ update: updateMock });
  updateMock.mockReturnValue({ in: inMock });
  inMock.mockResolvedValue({ error: null });
});

function renderPage() {
  return renderWithClient(
    <MemoryRouter>
      <Artworks />
    </MemoryRouter>
  );
}

describe('Artworks 批量软删除', () => {
  it('点击「批量管理」→ 全选 → 删除 → 确认，发起 update({ deleted_at }) .in("id", [...])', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '批量管理' }));
    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    fireEvent.click(screen.getByRole('button', { name: /删除\s*\(2\)/ }));

    expect(screen.getByRole('heading', { name: '确认批量删除' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    });

    expect(fromMock).toHaveBeenCalledWith('artworks');
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0];
    expect(payload).toHaveProperty('deleted_at');
    expect(typeof payload.deleted_at).toBe('string');
    expect(new Date(payload.deleted_at).toString()).not.toBe('Invalid Date');

    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock.mock.calls[0][0]).toBe('id');
    const ids = inMock.mock.calls[0][1] as string[];
    expect(ids.sort()).toEqual(['artwork-1', 'artwork-2']);

    expect(refetchMock).toHaveBeenCalled();
  });

  it('确认对话框中点击「取消」不发起 update', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '批量管理' }));
    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    fireEvent.click(screen.getByRole('button', { name: /删除\s*\(2\)/ }));

    const cancelInDialog = screen.getAllByRole('button', { name: '取消' });
    fireEvent.click(cancelInDialog[cancelInDialog.length - 1]);

    expect(updateMock).not.toHaveBeenCalled();
  });
});
