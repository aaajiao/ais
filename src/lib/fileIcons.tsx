/**
 * 文件类型图标映射
 * 使用 Lucide React 图标替代 emoji
 */

import { Image, FileText, Video, FileSpreadsheet, Link, Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 根据文件类型获取 Lucide 图标组件
 */
export function getFileTypeIcon(fileType: string, className = 'w-5 h-5'): ReactNode {
  switch (fileType) {
    case 'image':
      return <Image className={className} />;
    case 'pdf':
      return <FileText className={className} />;
    case 'video':
      return <Video className={className} />;
    case 'document':
      return <FileText className={className} />;
    case 'spreadsheet':
      return <FileSpreadsheet className={className} />;
    case 'link':
      return <Link className={className} />;
    default:
      return <Paperclip className={className} />;
  }
}

/**
 * 文件类型标签
 */
export function getFileTypeLabel(fileType: string): string {
  switch (fileType) {
    case 'image':
      return '图片';
    case 'pdf':
      return 'PDF';
    case 'video':
      return '视频';
    case 'document':
      return '文档';
    case 'spreadsheet':
      return '表格';
    case 'link':
      return '链接';
    default:
      return '文件';
  }
}
