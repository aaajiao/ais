import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];

export type ExportType = 'json' | 'artworks-csv' | 'editions-csv' | null;

/**
 * 准备 CSV 行数据，处理引号转义
 */
export function formatCSVRow(row: (string | number | boolean | null | undefined)[]): string {
  return row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',');
}

/**
 * 创建并下载文件
 */
export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([type.includes('csv') ? '\uFEFF' + content : content], { type });
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

export function useExport(artistName: string = 'aaajiao') {
  const [exporting, setExporting] = useState<ExportType>(null);

  // 导出 JSON（完整备份）
  const exportJSON = async (): Promise<{ success: boolean; error?: string }> => {
    setExporting('json');
    try {
      const [artworksRes, editionsRes, locationsRes, historyRes] = await Promise.all([
        supabase.from('artworks').select('*'),
        supabase.from('editions').select('*'),
        supabase.from('locations').select('*'),
        supabase.from('edition_history').select('*'),
      ]);

      const data = {
        exportedAt: new Date().toISOString(),
        artworks: artworksRes.data || [],
        editions: editionsRes.data || [],
        locations: locationsRes.data || [],
        edition_history: historyRes.data || [],
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

  // 导出 CSV（作品列表）
  const exportArtworksCSV = async (): Promise<{ success: boolean; error?: string; isEmpty?: boolean }> => {
    setExporting('artworks-csv');
    try {
      const { data: artworks } = await supabase.from('artworks').select('*').returns<Artwork[]>();
      if (!artworks || artworks.length === 0) {
        return { success: false, isEmpty: true };
      }

      const headers = ['ID', 'Title (EN)', 'Title (CN)', 'Year', 'Type', 'Materials', 'Dimensions', 'Duration', 'Edition Total', 'AP Total', 'Unique', 'Source URL', 'Created At'];
      const rows = artworks.map((a: Artwork) => [
        a.id,
        a.title_en,
        a.title_cn || '',
        a.year || '',
        a.type || '',
        a.materials || '',
        a.dimensions || '',
        a.duration || '',
        a.edition_total || '',
        a.ap_total || '',
        a.is_unique ? 'Yes' : 'No',
        a.source_url || '',
        a.created_at,
      ]);

      type CSVRow = (string | number | boolean | null | undefined)[];
      const allRows: CSVRow[] = [headers, ...rows];
      const csvContent = allRows.map(formatCSVRow).join('\n');

      downloadFile(
        csvContent,
        `${artistName}-artworks-${getDateString()}.csv`,
        'text/csv;charset=utf-8'
      );

      return { success: true };
    } catch (err) {
      console.error('Export CSV failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      setExporting(null);
    }
  };

  // 导出 CSV（版本列表）
  const exportEditionsCSV = async (): Promise<{ success: boolean; error?: string; isEmpty?: boolean }> => {
    setExporting('editions-csv');
    try {
      const { data: editions } = await supabase
        .from('editions')
        .select('*, artworks(title_en), locations(name)');

      if (!editions || editions.length === 0) {
        return { success: false, isEmpty: true };
      }

      type CSVRow = (string | number | boolean | null | undefined)[];
      const headers: CSVRow = ['ID', 'Artwork', 'Edition #', 'Type', 'Status', 'Location', 'Inventory #', 'Sale Price', 'Currency', 'Buyer', 'Sale Date', 'Notes', 'Created At'];
      const rows: CSVRow[] = editions.map((e: Record<string, unknown>): CSVRow => [
        e.id as string,
        (e.artworks as { title_en: string } | null)?.title_en || '',
        (e.edition_number as number | null) || '',
        (e.edition_type as string | null) || '',
        (e.status as string | null) || '',
        (e.locations as { name: string } | null)?.name || '',
        (e.inventory_number as string | null) || '',
        (e.sale_price as number | null) || '',
        (e.sale_currency as string | null) || '',
        (e.buyer_name as string | null) || '',
        (e.sale_date as string | null) || '',
        (e.notes as string | null) || '',
        e.created_at as string,
      ]);

      const allRows: CSVRow[] = [headers, ...rows];
      const csvContent = allRows.map(formatCSVRow).join('\n');

      downloadFile(
        csvContent,
        `${artistName}-editions-${getDateString()}.csv`,
        'text/csv;charset=utf-8'
      );

      return { success: true };
    } catch (err) {
      console.error('Export CSV failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      setExporting(null);
    }
  };

  return {
    exporting,
    exportJSON,
    exportArtworksCSV,
    exportEditionsCSV,
  };
}
