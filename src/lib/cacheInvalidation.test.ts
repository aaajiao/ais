import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateOnArtworkEdit,
  invalidateOnEditionEdit,
  invalidateOnEditionCreate,
  invalidateOnEditionDelete,
  invalidateOnArtworkDelete,
  invalidateOnArtworkPermanentDelete,
} from './cacheInvalidation';
import { queryKeys } from './queryKeys';

describe('cacheInvalidation', () => {
  let queryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
  });

  describe('invalidateOnArtworkEdit', () => {
    it('should invalidate artwork detail', async () => {
      await invalidateOnArtworkEdit(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.detail('artwork-1'),
      });
    });

    it('should invalidate artworks infinite list', async () => {
      await invalidateOnArtworkEdit(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['artworks', 'infinite'],
      });
    });

    it('should invalidate editions infinite list', async () => {
      await invalidateOnArtworkEdit(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'infinite'],
      });
    });

    it('should invalidate dashboard recent updates', async () => {
      await invalidateOnArtworkEdit(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.recentUpdates,
      });
    });

    it('should make 4 invalidation calls', async () => {
      await invalidateOnArtworkEdit(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('invalidateOnEditionEdit', () => {
    it('should invalidate edition detail', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.detail('edition-1'),
      });
    });

    it('should invalidate edition history', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.history('edition-1'),
      });
    });

    it('should invalidate editions infinite list', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'infinite'],
      });
    });

    it('should invalidate edition counts', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'counts'],
      });
    });

    it('should invalidate editions by artwork', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.byArtwork('artwork-1'),
      });
    });

    it('should invalidate parent artwork detail', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.detail('artwork-1'),
      });
    });

    it('should invalidate dashboard stats', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.stats,
      });
    });

    it('should invalidate dashboard recent updates', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.recentUpdates,
      });
    });

    it('should make 9 invalidation calls', async () => {
      await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(9);
    });
  });

  describe('invalidateOnEditionCreate', () => {
    it('should invalidate editions by artwork', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.byArtwork('artwork-1'),
      });
    });

    it('should invalidate editions infinite list', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'infinite'],
      });
    });

    it('should invalidate edition counts', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'counts'],
      });
    });

    it('should invalidate parent artwork detail', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.detail('artwork-1'),
      });
    });

    it('should invalidate dashboard stats', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.stats,
      });
    });

    it('should make 6 invalidation calls', async () => {
      await invalidateOnEditionCreate(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(6);
    });
  });

  describe('invalidateOnEditionDelete', () => {
    it('should invalidate all editions queries', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.all,
      });
    });

    it('should invalidate parent artwork detail', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.detail('artwork-1'),
      });
    });

    it('should invalidate artworks infinite list', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['artworks', 'infinite'],
      });
    });

    it('should invalidate dashboard stats', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.stats,
      });
    });

    it('should invalidate dashboard recent updates', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.recentUpdates,
      });
    });

    it('should make 5 invalidation calls', async () => {
      await invalidateOnEditionDelete(queryClient, 'artwork-1');

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('invalidateOnArtworkDelete', () => {
    it('should invalidate all artworks queries', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.all,
      });
    });

    it('should invalidate editions infinite list', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'infinite'],
      });
    });

    it('should invalidate edition counts', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['editions', 'counts'],
      });
    });

    it('should invalidate dashboard stats', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.stats,
      });
    });

    it('should invalidate dashboard recent updates', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.recentUpdates,
      });
    });

    it('should make 5 invalidation calls', async () => {
      await invalidateOnArtworkDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('invalidateOnArtworkPermanentDelete', () => {
    it('should invalidate all artworks queries', async () => {
      await invalidateOnArtworkPermanentDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.artworks.all,
      });
    });

    it('should invalidate all editions queries', async () => {
      await invalidateOnArtworkPermanentDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.editions.all,
      });
    });

    it('should invalidate dashboard stats', async () => {
      await invalidateOnArtworkPermanentDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.stats,
      });
    });

    it('should invalidate dashboard recent updates', async () => {
      await invalidateOnArtworkPermanentDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.recentUpdates,
      });
    });

    it('should make 4 invalidation calls', async () => {
      await invalidateOnArtworkPermanentDelete(queryClient);

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('query key patterns', () => {
    it('artworks.all should be a prefix for all artwork queries', () => {
      expect(queryKeys.artworks.all).toEqual(['artworks']);
    });

    it('editions.all should be a prefix for all edition queries', () => {
      expect(queryKeys.editions.all).toEqual(['editions']);
    });

    it('artworks.detail should include artwork ID', () => {
      expect(queryKeys.artworks.detail('test-id')).toContain('test-id');
    });

    it('editions.detail should include edition ID', () => {
      expect(queryKeys.editions.detail('test-id')).toContain('test-id');
    });

    it('editions.history should include edition ID', () => {
      expect(queryKeys.editions.history('test-id')).toContain('test-id');
    });

    it('editions.byArtwork should include artwork ID', () => {
      expect(queryKeys.editions.byArtwork('test-id')).toContain('test-id');
    });
  });
});
