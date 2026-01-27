/**
 * File components barrel exports
 * Only exports public API (avoiding bundle-barrel-imports anti-pattern)
 */

export { default as FileList } from './FileList';
export { FileListItem } from './FileListItem';
export { FileGridItem } from './FileGridItem';
export { FilePreviewModal } from './FilePreviewModal';
export { ImageThumbnail } from './ImageThumbnail';
export { ImagePreview } from './ImagePreview';
export type { EditionFile, FileListProps } from './types';
