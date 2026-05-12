import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/useAuthContext';
import type { Database } from '@/lib/database.types';
import type { ExportRequest, ExportOptions } from '@/lib/exporters';

type Edition = Database['public']['Tables']['editions']['Row'];
type EditionFile = Database['public']['Tables']['edition_files']['Row'];
type EditionHistory = Database['public']['Tables']['edition_history']['Row'];

export type ExportType = 'json' | 'md' | null;

/**
 * 创建并下载文件
 */
export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 获取当前日期字符串 YYYY-MM-DD
 */
export function getDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 设置页全量备份的 ExportOptions —— 全字段打开
 */
const FULL_BACKUP_OPTIONS: ExportOptions = {
  includePrice: true,
  includeStatus: true,
  includeLocation: true,
  includeDetails: true,
  includeFiles: true,
};

export function useExport(artistName: string = 'aaajiao') {
  const [exporting, setExporting] = useState<ExportType>(null);
  const { session } = useAuthContext();

  /**
   * 导出 JSON 全量备份
   * 结构：artworks/locations 顶层 lookup，files 和 history 嵌套到 editions[].files / editions[].history
   */
  const exportJSON = async (): Promise<{ success: boolean; error?: string }> => {
    setExporting('json');
    try {
      const [artworksRes, editionsRes, locationsRes, filesRes, historyRes] = await Promise.all([
        supabase.from('artworks').select('*').is('deleted_at', null),
        supabase.from('editions').select('*'),
        supabase.from('locations').select('*'),
        supabase.from('edition_files').select('*'),
        supabase.from('edition_history').select('*'),
      ]);

      const editions = (editionsRes.data || []) as Edition[];
      const files = (filesRes.data || []) as EditionFile[];
      const history = (historyRes.data || []) as EditionHistory[];

      // 按 edition_id 分组
      const filesByEdition = new Map<string, EditionFile[]>();
      for (const f of files) {
        const arr = filesByEdition.get(f.edition_id) || [];
        arr.push(f);
        filesByEdition.set(f.edition_id, arr);
      }

      const historyByEdition = new Map<string, EditionHistory[]>();
      for (const h of history) {
        const arr = historyByEdition.get(h.edition_id) || [];
        arr.push(h);
        historyByEdition.set(h.edition_id, arr);
      }

      // editions 嵌套 files + history
      const editionsWithNested = editions.map(e => ({
        ...e,
        files: filesByEdition.get(e.id) || [],
        history: historyByEdition.get(e.id) || [],
      }));

      const data = {
        exportedAt: new Date().toISOString(),
        artworks: artworksRes.data || [],
        editions: editionsWithNested,
        locations: locationsRes.data || [],
      };

      downloadFile(
        JSON.stringify(data, null, 2),
        `${artistName}-inventory-backup-${getDateString()}.json`,
        'application/json'
      );

      return { success: true };
    } catch (err) {
      console.error('Export JSON failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      setExporting(null);
    }
  };

  /**
   * 导出 MD 全量备份
   * 调用 /api/export/md (scope=all, options 全开)；服务端会自动加 edition_history
   */
  const exportMD = async (): Promise<{ success: boolean; error?: string }> => {
    setExporting('md');
    try {
      if (!session?.access_token) {
        return { success: false, error: 'Not authenticated' };
      }

      const request: ExportRequest = {
        scope: 'all',
        format: 'md',
        options: FULL_BACKUP_OPTIONS,
        artistName,
      };

      const response = await fetch('/api/export/md', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorMessage = `Export failed (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // 响应不是 JSON
        }
        return { success: false, error: errorMessage };
      }

      // 解析服务端给的文件名（已经是 inventory-backup-{date}.md 格式）
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${artistName}-inventory-backup-${getDateString()}.md`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (err) {
      console.error('Export MD failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      setExporting(null);
    }
  };

  return {
    exporting,
    exportJSON,
    exportMD,
  };
}
