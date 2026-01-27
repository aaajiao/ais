import type { ParsedArtwork } from '@/lib/md-parser';

export interface PreviewResult {
  new: Array<{
    artwork: ParsedArtwork & { thumbnail_url: string | null };
    requiresThumbnail: boolean;
    availableImages: string[];
    _uid?: string;
  }>;
  updates: Array<{
    existingId: string;
    existingArtwork: Record<string, unknown>;
    newData: ParsedArtwork;
    changes: Array<{
      field: string;
      fieldLabel: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
    _uid?: string;
  }>;
  unchanged: Array<{
    existingId: string;
    title: string;
  }>;
}

export interface ExecuteResult {
  created: string[];
  updated: string[];
  errors: string[];
  imageProcessing?: {
    processed: number;
    failed: number;
  };
}

export interface BatchProgress {
  current: number;
  total: number;
  processed: number;
  totalArtworks: number;
}

export type ImportStep = 'upload' | 'preview' | 'result';

/**
 * 生成作品的唯一标识符（优先使用 source_url，否则用 title_en + index）
 */
export function getArtworkUid(
  artwork: { title_en: string; source_url?: string | null },
  index: number
): string {
  return artwork.source_url || `${artwork.title_en}::${index}`;
}
