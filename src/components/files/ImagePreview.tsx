/**
 * 图片预览组件
 * 用于网格视图，异步加载签名 URL
 */

import { useState, useEffect, memo } from 'react';
import { getSignedUrl } from '@/lib/supabase';
import { Image as ImageIcon } from 'lucide-react';
import type { ImagePreviewProps } from './types';

export const ImagePreview = memo(function ImagePreview({ file }: ImagePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return url ? (
    <img
      src={url}
      alt={file.file_name || ''}
      className="absolute inset-0 w-full h-full object-cover"
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center">
      <ImageIcon className="w-12 h-12 text-muted-foreground" />
    </div>
  );
});
