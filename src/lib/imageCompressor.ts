/**
 * 图片压缩工具
 * 使用 Canvas API 在客户端压缩图片
 */

export interface CompressionOptions {
  maxSizeMB: number;      // 目标最大大小（MB）
  quality: number;        // 压缩质量 0-1
  maxWidth?: number;      // 最大宽度
  maxHeight?: number;     // 最大高度
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 2,
  quality: 0.8,
  maxWidth: 2000,
  maxHeight: 2000,
};

/**
 * 检查文件是否需要压缩
 */
export function needsCompression(file: File, thresholdMB: number = 2): boolean {
  const thresholdBytes = thresholdMB * 1024 * 1024;
  return file.size > thresholdBytes && file.type.startsWith('image/');
}

/**
 * 检查是否为图片文件
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * 压缩图片
 */
export async function compressImage(
  file: File,
  options: Partial<CompressionOptions> = {}
): Promise<CompressionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { quality, maxWidth = 2000, maxHeight = 2000 } = opts;

  // 创建图片对象
  const img = await loadImage(file);

  // 计算缩放尺寸
  let { width, height } = calculateDimensions(
    img.width,
    img.height,
    maxWidth,
    maxHeight
  );

  // 创建 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文');
  }

  // 绘制图片
  ctx.drawImage(img, 0, 0, width, height);

  // 压缩输出为 JPEG（更好的压缩率）
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);

  return {
    blob,
    originalSize: file.size,
    compressedSize: blob.size,
    compressionRatio: blob.size / file.size,
    width,
    height,
  };
}

/**
 * 加载图片
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('图片加载失败'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 计算保持比例的缩放尺寸
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  return { width, height };
}

/**
 * Canvas 转 Blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas 转换失败'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 根据文件类型获取图标
 */
export function getFileTypeIcon(fileType: string): string {
  switch (fileType) {
    case 'image':
      return '🖼';
    case 'pdf':
      return '📄';
    case 'video':
      return '🎬';
    case 'document':
      return '📝';
    case 'spreadsheet':
      return '📊';
    case 'link':
      return '🔗';
    default:
      return '📎';
  }
}

/**
 * 根据文件扩展名或 MIME 类型判断文件类型
 */
export function detectFileType(file: File | string): string {
  const mimeOrUrl = typeof file === 'string' ? file : file.type;
  const name = typeof file === 'string' ? file : file.name;

  // 根据 MIME 类型判断
  if (mimeOrUrl.startsWith('image/')) return 'image';
  if (mimeOrUrl === 'application/pdf') return 'pdf';
  if (mimeOrUrl.startsWith('video/')) return 'video';
  if (mimeOrUrl.includes('spreadsheet') || mimeOrUrl.includes('excel') || mimeOrUrl === 'text/csv') return 'spreadsheet';
  if (mimeOrUrl.includes('document') || mimeOrUrl.includes('word')) return 'document';

  // 根据扩展名判断
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'mp4':
    case 'mov':
    case 'webm':
    case 'avi':
      return 'video';
    case 'xlsx':
    case 'xls':
    case 'csv':
      return 'spreadsheet';
    case 'doc':
    case 'docx':
    case 'txt':
      return 'document';
    default:
      return 'other';
  }
}

/**
 * 根据 URL 检测链接类型
 */
export function detectLinkType(url: string): string {
  const lowerUrl = url.toLowerCase();

  // 视频平台
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') ||
      lowerUrl.includes('vimeo.com') || lowerUrl.includes('bilibili.com')) {
    return 'video';
  }

  // 文档平台
  if (lowerUrl.includes('docs.google.com') || lowerUrl.includes('notion.so') ||
      lowerUrl.includes('dropbox.com') && !lowerUrl.includes('/s/')) {
    return 'document';
  }

  // 表格
  if (lowerUrl.includes('sheets.google.com') || lowerUrl.includes('airtable.com')) {
    return 'spreadsheet';
  }

  // 根据扩展名
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'mp4':
    case 'mov':
    case 'webm':
      return 'video';
    default:
      return 'link';
  }
}
