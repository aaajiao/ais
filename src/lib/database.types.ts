// 数据库类型定义（基于 Supabase Schema）

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// 枚举类型
export type UserRole = 'admin' | 'editor';
export type UserStatus = 'active' | 'inactive';
export type LocationType = 'studio' | 'gallery' | 'museum' | 'other';
export type EditionType = 'numbered' | 'ap' | 'unique';
export type EditionStatus =
  | 'in_production'
  | 'in_studio'
  | 'at_gallery'
  | 'at_museum'
  | 'in_transit'
  | 'sold'
  | 'gifted'
  | 'lost'
  | 'damaged';
export type ConditionType = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
export type CurrencyType = 'USD' | 'EUR' | 'CNY' | 'GBP' | 'CHF' | 'HKD' | 'JPY';
export type FileType = 'image' | 'pdf' | 'video' | 'document' | 'spreadsheet' | 'link' | 'other';
export type FileSourceType = 'upload' | 'link';
export type HistoryAction =
  | 'created'
  | 'status_change'
  | 'location_change'
  | 'sold'
  | 'consigned'
  | 'returned'
  | 'condition_update'
  | 'file_added'
  | 'number_assigned';
export type GalleryLinkStatus = 'active' | 'disabled';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          role: UserRole;
          status: UserStatus;
          last_login: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          last_login?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          role?: UserRole;
          status?: UserStatus;
          last_login?: string | null;
          created_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          name: string;
          type: LocationType;
          aliases: string[];
          city: string | null;
          country: string | null;
          address: string | null;
          contact: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type?: LocationType;
          aliases?: string[];
          city?: string | null;
          country?: string | null;
          address?: string | null;
          contact?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: LocationType;
          aliases?: string[];
          city?: string | null;
          country?: string | null;
          address?: string | null;
          contact?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      gallery_links: {
        Row: {
          id: string;
          gallery_name: string;
          token: string;
          status: GalleryLinkStatus;
          show_prices: boolean;
          last_accessed: string | null;
          access_count: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          gallery_name: string;
          token: string;
          status?: GalleryLinkStatus;
          show_prices?: boolean;
          last_accessed?: string | null;
          access_count?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          gallery_name?: string;
          token?: string;
          status?: GalleryLinkStatus;
          show_prices?: boolean;
          last_accessed?: string | null;
          access_count?: number;
          created_at?: string;
          created_by?: string | null;
        };
      };
      artworks: {
        Row: {
          id: string;
          source_url: string | null;
          title_en: string;
          title_cn: string | null;
          year: string | null;
          type: string | null;
          materials: string | null;
          dimensions: string | null;
          duration: string | null;
          thumbnail_url: string | null;
          edition_total: number | null;
          ap_total: number | null;
          is_unique: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_url?: string | null;
          title_en: string;
          title_cn?: string | null;
          year?: string | null;
          type?: string | null;
          materials?: string | null;
          dimensions?: string | null;
          duration?: string | null;
          thumbnail_url?: string | null;
          edition_total?: number | null;
          ap_total?: number | null;
          is_unique?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_url?: string | null;
          title_en?: string;
          title_cn?: string | null;
          year?: string | null;
          type?: string | null;
          materials?: string | null;
          dimensions?: string | null;
          duration?: string | null;
          thumbnail_url?: string | null;
          edition_total?: number | null;
          ap_total?: number | null;
          is_unique?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      editions: {
        Row: {
          id: string;
          artwork_id: string;
          inventory_number: string | null;
          edition_type: EditionType;
          edition_number: number | null;
          status: EditionStatus;
          location_id: string | null;
          storage_detail: string | null;
          condition: ConditionType;
          condition_notes: string | null;
          sale_price: number | null;
          sale_currency: CurrencyType | null;
          sale_date: string | null;
          buyer_name: string | null;
          consignment_start: string | null;
          loan_institution: string | null;
          loan_end: string | null;
          certificate_number: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          artwork_id: string;
          inventory_number?: string | null;
          edition_type: EditionType;
          edition_number?: number | null;
          status?: EditionStatus;
          location_id?: string | null;
          storage_detail?: string | null;
          condition?: ConditionType;
          condition_notes?: string | null;
          sale_price?: number | null;
          sale_currency?: CurrencyType | null;
          sale_date?: string | null;
          buyer_name?: string | null;
          consignment_start?: string | null;
          loan_institution?: string | null;
          loan_end?: string | null;
          certificate_number?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          artwork_id?: string;
          inventory_number?: string | null;
          edition_type?: EditionType;
          edition_number?: number | null;
          status?: EditionStatus;
          location_id?: string | null;
          storage_detail?: string | null;
          condition?: ConditionType;
          condition_notes?: string | null;
          sale_price?: number | null;
          sale_currency?: CurrencyType | null;
          sale_date?: string | null;
          buyer_name?: string | null;
          consignment_start?: string | null;
          loan_institution?: string | null;
          loan_end?: string | null;
          certificate_number?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      edition_files: {
        Row: {
          id: string;
          edition_id: string;
          source_type: FileSourceType;
          file_url: string;
          file_type: FileType;
          file_name: string | null;
          file_size: number | null;
          description: string | null;
          sort_order: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          edition_id: string;
          source_type: FileSourceType;
          file_url: string;
          file_type: FileType;
          file_name?: string | null;
          file_size?: number | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          edition_id?: string;
          source_type?: FileSourceType;
          file_url?: string;
          file_type?: FileType;
          file_name?: string | null;
          file_size?: number | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          created_by?: string | null;
        };
      };
      edition_history: {
        Row: {
          id: string;
          edition_id: string;
          action: HistoryAction;
          from_status: string | null;
          to_status: string | null;
          from_location: string | null;
          to_location: string | null;
          related_party: string | null;
          price: number | null;
          currency: string | null;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          edition_id: string;
          action: HistoryAction;
          from_status?: string | null;
          to_status?: string | null;
          from_location?: string | null;
          to_location?: string | null;
          related_party?: string | null;
          price?: number | null;
          currency?: string | null;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          edition_id?: string;
          action?: HistoryAction;
          from_status?: string | null;
          to_status?: string | null;
          from_location?: string | null;
          to_location?: string | null;
          related_party?: string | null;
          price?: number | null;
          currency?: string | null;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      location_type: LocationType;
      edition_type: EditionType;
      edition_status: EditionStatus;
      condition_type: ConditionType;
      currency_type: CurrencyType;
      file_type: FileType;
      file_source_type: FileSourceType;
      history_action: HistoryAction;
      gallery_link_status: GalleryLinkStatus;
    };
  };
}
