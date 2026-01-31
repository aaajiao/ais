/**
 * File components shared types
 */

import type { FileType } from '@/lib/database.types';

export interface EditionFile {
  id: string;
  edition_id: string;
  source_type: 'upload' | 'link';
  file_url: string;
  file_type: FileType;
  file_name: string | null;
  file_size: number | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

export interface FileListProps {
  files: EditionFile[];
  editionId: string;
  onDelete?: (fileId: string) => void;
  viewMode?: 'grid' | 'list';
  isEditing?: boolean;
}

export interface FileItemBaseProps {
  file: EditionFile;
  isEditing: boolean;
  onOpen: (file: EditionFile) => void;
  onDelete: (file: EditionFile) => void;
}

export interface FileListItemProps extends FileItemBaseProps {
  onDownload: (file: EditionFile) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  deletingId: string | null;
  downloadingId: string | null;
  formatDate: (dateStr: string) => string;
}

export interface FileGridItemProps extends FileItemBaseProps {
  onRequestDelete: (fileId: string) => void;
}

export interface FilePreviewModalProps {
  file: EditionFile | null;
  imageUrl: string | null;
  onClose: () => void;
}

export interface ImageThumbnailProps {
  file: EditionFile;
  size?: number;
}

export interface ImagePreviewProps {
  file: EditionFile;
}
