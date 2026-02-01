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
 * 版本槽位（用于下拉选择）
 */
export interface EditionSlot {
  /** 下拉显示文本："1", "2", "AP1", "Unique" */
  label: string;
  /** 用于 select value 的唯一键："numbered:1", "ap:1", "unique:0" */
  value: string;
  edition_type: 'numbered' | 'ap' | 'unique';
  edition_number: number;
}

/**
 * 根据作品配额和已有版本，生成可选的版本槽位列表
 */
export function getAvailableEditionSlots(
  editionTotal: number | null,
  apTotal: number | null,
  isUnique: boolean | null,
  existingEditions: EditionData[]
): EditionSlot[] {
  const slots: EditionSlot[] = [];

  if (isUnique) {
    const hasUnique = existingEditions.some(e => e.edition_type === 'unique');
    if (!hasUnique) {
      slots.push({ label: 'Unique', value: 'unique:0', edition_type: 'unique', edition_number: 0 });
    }
    return slots;
  }

  // Numbered slots
  const existingNumbered = new Set(
    existingEditions.filter(e => e.edition_type === 'numbered').map(e => e.edition_number)
  );
  for (let i = 1; i <= (editionTotal || 0); i++) {
    if (!existingNumbered.has(i)) {
      slots.push({ label: String(i), value: `numbered:${i}`, edition_type: 'numbered', edition_number: i });
    }
  }

  // AP slots
  const existingAp = new Set(
    existingEditions.filter(e => e.edition_type === 'ap').map(e => e.edition_number)
  );
  const apCount = apTotal || 0;
  for (let i = 1; i <= apCount; i++) {
    if (!existingAp.has(i)) {
      const label = apCount === 1 ? 'AP' : `AP${i}`;
      slots.push({ label, value: `ap:${i}`, edition_type: 'ap', edition_number: i });
    }
  }

  return slots;
}

/**
 * 从槽位创建新版本数据
 */
export function createNewEditionFromSlot(slot: EditionSlot): NewEditionData {
  return {
    edition_type: slot.edition_type,
    edition_number: slot.edition_number,
    status: 'in_studio',
    inventory_number: '',
    notes: '',
  };
}
