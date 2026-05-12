import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchExistingArtworkTypes } from '@/lib/normalizeArtworkType';

/**
 * 拉取当前用户 artworks 表里所有非空 type 的去重列表，按出现频次 desc。
 *
 * 用于 ArtworkEditForm 的 <datalist> 提示和提交前归一化匹配。
 * 165 条数据 client-side dedupe 简单可靠。
 *
 * RLS 已基于 auth.uid() 自动过滤当前用户，所以不需要显式传 userId。
 */
export function useArtworkTypes() {
  return useQuery({
    queryKey: ['artworks', 'types'],
    queryFn: () => fetchExistingArtworkTypes(supabase),
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新拉
  });
}
