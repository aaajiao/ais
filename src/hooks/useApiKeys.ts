/**
 * API Key 管理 Hook
 * 获取、创建、撤销、删除 API 密钥
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ApiKey } from '@/lib/types';

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('未登录');

      const response = await fetch('/api/keys', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch API keys');
      }

      const data = await response.json();
      setKeys(data.keys || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch API keys';
      setError(message);
      console.error('Failed to fetch API keys:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = useCallback(async (name: string): Promise<{ key: ApiKey; rawKey: string }> => {
    const token = await getAccessToken();
    if (!token) throw new Error('未登录');

    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to create API key');
    }

    const result = await response.json();
    const newKey = result.key as ApiKey;
    const rawKey = result.rawKey as string;

    setKeys(prev => [newKey, ...prev]);

    return { key: newKey, rawKey };
  }, []);

  const revokeKey = useCallback(async (id: string): Promise<void> => {
    const token = await getAccessToken();
    if (!token) throw new Error('未登录');

    const response = await fetch('/api/keys', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to revoke API key');
    }

    const result = await response.json();
    const updatedKey = result.key as ApiKey;

    setKeys(prev =>
      prev.map(k => (k.id === updatedKey.id ? { ...k, ...updatedKey } : k))
    );
  }, []);

  const deleteKey = useCallback(async (id: string): Promise<void> => {
    const token = await getAccessToken();
    if (!token) throw new Error('未登录');

    const response = await fetch(`/api/keys?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Failed to delete API key');
    }

    setKeys(prev => prev.filter(k => k.id !== id));
  }, []);

  return {
    keys,
    isLoading,
    error,
    fetchKeys,
    createKey,
    revokeKey,
    deleteKey,
    refetch: fetchKeys,
  };
}
