/**
 * 图片缩略图组件
 * 用于列表视图，异步加载签名 URL
 */

import { useState, useEffect, memo } from 'react';
import { getSignedUrl } from '@/lib/supabase';
import { Image as ImageIcon } from 'lucide-react';
import type { ImageThumbnailProps } from './types';

export const ImageThumbnail = memo(function ImageThumbnail({
  file,
  size = 48,
}: ImageThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadUrl = async () => {
      try {
        if (file.source_type === 'link') {
          if (mounted) {
            setUrl(file.file_url);
            setLoading(false);
          }
        } else {
          const signedUrl = await getSignedUrl('edition-files', file.file_url);
          if (mounted) {
            setUrl(signedUrl);
            setLoading(false);
          }
        }
      } catch {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      mounted = false;
    };
  }, [file.file_url, file.source_type]);

  if (loading) {
    return (
      <div
        className="flex-shrink-0 bg-muted animate-pulse rounded-lg flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className="flex-shrink-0 bg-muted rounded-lg flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={file.file_name || ''}
      className="flex-shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
});
