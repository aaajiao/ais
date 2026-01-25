// 用户角色
export type UserRole = 'admin' | 'editor';

// 用户状态
export type UserStatus = 'active' | 'inactive';

// 位置类型
export type LocationType = 'studio' | 'gallery' | 'museum' | 'other';

// 版本类型
export type EditionType = 'numbered' | 'ap' | 'unique';

// 版本状态
export type EditionStatus =
  | 'in_production'  // 制作中
  | 'in_studio'      // 工作室
  | 'at_gallery'     // 画廊
  | 'at_museum'      // 美术馆
  | 'in_transit'     // 在途
  | 'sold'           // 已售
  | 'gifted'         // 赠送
  | 'lost'           // 遗失
  | 'damaged';       // 损坏

// 品相
export type Condition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';

// 货币
export type Currency = 'USD' | 'EUR' | 'CNY' | 'GBP' | 'CHF' | 'HKD' | 'JPY';

// 文件类型
export type FileType = 'image' | 'pdf' | 'video' | 'document' | 'markdown' | 'spreadsheet' | 'link' | 'other';

// 文件来源
export type FileSourceType = 'upload' | 'link';

// 历史操作类型
export type HistoryAction =
  | 'created'
  | 'status_change'
  | 'location_change'
  | 'sold'
  | 'consigned'
  | 'returned'
  | 'condition_update'
  | 'file_added'
  | 'file_deleted'
  | 'number_assigned';

// 用户
export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  status: UserStatus;
  last_login?: string;
  created_at: string;
}

// 位置
export interface Location {
  id: string;
  name: string;
  type: LocationType;
  aliases?: string[];
  city?: string;
  country?: string;
  address?: string;
  contact?: string;
  notes?: string;
  created_at: string;
}

// 画廊链接
export interface GalleryLink {
  id: string;
  gallery_name: string;
  token: string;
  status: 'active' | 'disabled';
  show_prices: boolean;
  last_accessed?: string;
  access_count: number;
  created_at: string;
  created_by?: string;
}

// 作品
export interface Artwork {
  id: string;
  source_url?: string;
  title_en: string;
  title_cn?: string;
  year?: string;
  type?: string;
  materials?: string;
  dimensions?: string;
  duration?: string;
  thumbnail_url?: string;
  edition_total?: number;
  ap_total?: number;
  is_unique?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 版本
export interface Edition {
  id: string;
  artwork_id: string;
  inventory_number?: string;
  edition_type: EditionType;
  edition_number?: number;
  status: EditionStatus;
  location_id?: string;
  storage_detail?: string;
  condition?: Condition;
  condition_notes?: string;
  sale_price?: number;
  sale_currency?: Currency;
  sale_date?: string;
  buyer_name?: string;
  consignment_start?: string;
  loan_institution?: string;
  loan_end?: string;
  certificate_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // 关联数据
  artwork?: Artwork;
  location?: Location;
}

// 版本附件
export interface EditionFile {
  id: string;
  edition_id: string;
  source_type: FileSourceType;
  file_url: string;
  file_type: FileType;
  file_name?: string;
  file_size?: number;
  description?: string;
  sort_order?: number;
  created_at: string;
  created_by?: string;
}

// 版本历史
export interface EditionHistory {
  id: string;
  edition_id: string;
  action: HistoryAction;
  from_status?: string;
  to_status?: string;
  from_location?: string;
  to_location?: string;
  related_party?: string;
  price?: number;
  currency?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
}

// 状态显示配置
export const STATUS_CONFIG: Record<EditionStatus, { label: string; color: string }> = {
  in_production: { label: '制作中', color: 'text-yellow-500' },
  in_studio: { label: '工作室', color: 'text-green-500' },
  at_gallery: { label: '画廊', color: 'text-yellow-500' },
  at_museum: { label: '美术馆', color: 'text-blue-500' },
  in_transit: { label: '在途', color: 'text-orange-500' },
  sold: { label: '已售', color: 'text-red-500' },
  gifted: { label: '赠送', color: 'text-purple-500' },
  lost: { label: '遗失', color: 'text-gray-500' },
  damaged: { label: '损坏', color: 'text-red-500' },
};
