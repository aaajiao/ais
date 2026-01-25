import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// 导出类型化的 Supabase 客户端类型
export type TypedSupabaseClient = SupabaseClient<Database>;

// 导出表插入类型
export type EditionFilesInsert = Database['public']['Tables']['edition_files']['Insert'];
export type EditionHistoryInsert = Database['public']['Tables']['edition_history']['Insert'];
export type LocationsInsert = Database['public']['Tables']['locations']['Insert'];
export type LocationsUpdate = Database['public']['Tables']['locations']['Update'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL 或 Anon Key 未配置，请检查 .env.local 文件');
}

// 创建 Supabase 客户端
export const supabase = createClient<Database>(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// 辅助函数：获取存储文件的公开 URL
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// 辅助函数：获取存储文件的签名 URL（私有文件）
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('获取签名 URL 失败:', error);
    return null;
  }

  return data.signedUrl;
}

// 辅助函数：上传文件
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  options?: { upsert?: boolean }
): Promise<{ path: string; error: Error | null }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: options?.upsert ?? false,
    });

  if (error) {
    return { path: '', error: error as Error };
  }

  return { path: data.path, error: null };
}

// 辅助函数：删除文件
export async function deleteFile(
  bucket: string,
  paths: string[]
): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  return { error: error as Error | null };
}

// 辅助函数：插入数据（带类型安全）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertIntoTable<T extends keyof Database['public']['Tables']>(
  table: T,
  data: Database['public']['Tables'][T]['Insert']
) {
  // @ts-expect-error - Supabase generic types have issues with some configurations
  return supabase.from(table).insert(data).select().single();
}

// 辅助函数：插入数据不返回（带类型安全）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertIntoTableNoReturn<T extends keyof Database['public']['Tables']>(
  table: T,
  data: Database['public']['Tables'][T]['Insert']
) {
  // @ts-expect-error - Supabase generic types have issues with some configurations
  return supabase.from(table).insert(data);
}

// 辅助函数：更新数据（带类型安全）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTable<T extends keyof Database['public']['Tables']>(
  table: T,
  data: Database['public']['Tables'][T]['Update'],
  id: string
) {
  // @ts-expect-error - Supabase generic types have issues with some configurations
  return supabase.from(table).update(data).eq('id', id).select().single();
}
