import type { EditionStatus } from '@/lib/database.types';

// 编辑表单数据类型
export interface ArtworkFormData {
  title_en: string;
  title_cn: string;
  year: string;
  type: string;
  materials: string;
  dimensions: string;
  duration: string;
  edition_total: number;
  ap_total: number;
  is_unique: boolean;
  source_url: string;
  thumbnail_url: string;
  notes: string;
}

// 新版本表单数据类型
export interface NewEditionData {
  edition_type: 'numbered' | 'ap' | 'unique';
  edition_number: number;
  status: EditionStatus;
  inventory_number: string;
  notes: string;
}

// 作品数据类型（从 useArtworkDetail 返回）
export interface ArtworkData {
  id: string;
  title_en: string;
  title_cn: string | null;
  year: string | null;
  type: string | null;
  materials: string | null;
  dimensions: string | null;
  duration: string | null;
  edition_total: number | null;
  ap_total: number | null;
  is_unique: boolean | null;
  source_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
}

// 版本数据类型
export interface EditionData {
  id: string;
  edition_type: string;
  edition_number: number | null;
  status: EditionStatus;
  inventory_number: string | null;
  location?: { name: string } | null;
}

/**
 * 从作品数据初始化表单数据
 */
export function initFormDataFromArtwork(artwork: ArtworkData): ArtworkFormData {
  return {
    title_en: artwork.title_en || '',
    title_cn: artwork.title_cn || '',
    year: artwork.year || '',
    type: artwork.type || '',
    materials: artwork.materials || '',
    dimensions: artwork.dimensions || '',
    duration: artwork.duration || '',
    edition_total: artwork.edition_total || 0,
    ap_total: artwork.ap_total || 0,
    is_unique: artwork.is_unique || false,
    source_url: artwork.source_url || '',
    thumbnail_url: artwork.thumbnail_url || '',
    notes: artwork.notes || '',
  };
}

/**
 * 格式化版本号显示
 */
export function formatEditionNumber(
  edition: { edition_type: string; edition_number: number | null },
  editionTotal: number | null | undefined,
  uniqueLabel: string
): string {
  if (edition.edition_type === 'unique') return uniqueLabel;
  if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
  return `${edition.edition_number || '?'}/${editionTotal || '?'}`;
}

/**
 * 创建默认的新版本数据
 */
export function createDefaultNewEdition(existingEditionsCount: number): NewEditionData {
  return {
    edition_type: 'numbered',
    edition_number: existingEditionsCount + 1,
    status: 'in_studio',
    inventory_number: '',
    notes: '',
  };
}
