/**
 * 链接管理 Hook
 * 获取、创建、更新、删除公开展示链接
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { GalleryLinkStatus } from '@/lib/database.types';

export interface Link {
  id: string;
  gallery_name: string; // 实际存储位置名称
  token: string;
  status: GalleryLinkStatus;
  show_prices: boolean;
  last_accessed: string | null;
  access_count: number;
  created_at: string;
  created_by: string | null;
  // 额外统计信息（从 API 获取）
  edition_count?: number;
}

export interface CreateLinkData {
  location_name: string;
  show_prices?: boolean;
}

export interface UpdateLinkData {
  id: string;
  status?: GalleryLinkStatus;
  show_prices?: boolean;
  reset_token?: boolean;
}

// 获取当前用户的 access token
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export function useLinks() {
  const [links, setLinks] = useState<Link[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取所有链接
  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('未登录');
      }

      const response = await fetch('/api/links', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '获取链接失败');
      }

      const data = await response.json();
      setLinks(data.links || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取链接失败';
      setError(message);
      console.error('获取链接失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // 创建链接
  const createLink = useCallback(async (data: CreateLinkData): Promise<Link> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch('/api/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || '创建链接失败');
    }

    const result = await response.json();
    const newLink = result.link as Link;

    // 更新本地状态
    setLinks(prev => [newLink, ...prev]);

    return newLink;
  }, []);

  // 更新链接
  const updateLink = useCallback(async (data: UpdateLinkData): Promise<Link> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch('/api/links', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || '更新链接失败');
    }

    const result = await response.json();
    const updatedLink = result.link as Link;

    // 更新本地状态
    setLinks(prev =>
      prev.map(link => (link.id === updatedLink.id ? { ...link, ...updatedLink } : link))
    );

    return updatedLink;
  }, []);

  // 删除链接
  const deleteLink = useCallback(async (id: string): Promise<void> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch(`/api/links?id=${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || '删除链接失败');
    }

    // 更新本地状态
    setLinks(prev => prev.filter(link => link.id !== id));
  }, []);

  // 切换链接状态
  const toggleStatus = useCallback(async (id: string): Promise<Link> => {
    const link = links.find(l => l.id === id);
    if (!link) {
      throw new Error('链接不存在');
    }

    const newStatus: GalleryLinkStatus = link.status === 'active' ? 'disabled' : 'active';
    return updateLink({ id, status: newStatus });
  }, [links, updateLink]);

  // 切换显示价格
  const toggleShowPrices = useCallback(async (id: string): Promise<Link> => {
    const link = links.find(l => l.id === id);
    if (!link) {
      throw new Error('链接不存在');
    }

    return updateLink({ id, show_prices: !link.show_prices });
  }, [links, updateLink]);

  // 重置 token
  const resetToken = useCallback(async (id: string): Promise<Link> => {
    return updateLink({ id, reset_token: true });
  }, [updateLink]);

  // 生成完整的公开链接 URL
  const getPublicUrl = useCallback((token: string): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/view/${token}`;
  }, []);

  // 复制链接到剪贴板
  const copyLinkToClipboard = useCallback(async (token: string): Promise<boolean> => {
    const url = getPublicUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (err) {
      console.error('复制失败:', err);
      return false;
    }
  }, [getPublicUrl]);

  return {
    links,
    isLoading,
    error,
    fetchLinks,
    createLink,
    updateLink,
    deleteLink,
    toggleStatus,
    toggleShowPrices,
    resetToken,
    getPublicUrl,
    copyLinkToClipboard,
    refetch: fetchLinks,
  };
}
