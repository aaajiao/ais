/**
 * 文件上传 Hook
 * 管理上传队列、进度和压缩
 */

import { useState, useCallback } from 'react';
import { supabase, uploadFile, deleteFile, insertIntoTable, insertIntoTableNoReturn, type EditionFilesInsert, type EditionHistoryInsert } from '@/lib/supabase';
import {
  compressImage,
  needsCompression,
  isImageFile,
  detectFileType,
  formatFileSize,
} from '@/lib/imageCompressor';
import type { FileType, FileSourceType } from '@/lib/database.types';

// 上传文件状态
export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';
  error?: string;
  originalSize: number;
  compressedSize?: number;
}

// 上传完成后的文件记录
export interface UploadedFile {
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
}

interface UseFileUploadOptions {
  editionId: string;
  bucket?: string;
  autoCompress?: boolean;
  compressionThresholdMB?: number;
  compressionQuality?: number;
  maxConcurrent?: number;
  onUploadComplete?: (file: UploadedFile) => void;
  onError?: (error: string, file: File) => void;
}

export function useFileUpload(options: UseFileUploadOptions) {
  const {
    editionId,
    bucket = 'edition-files',
    autoCompress = true,
    compressionThresholdMB = 2,
    compressionQuality = 0.8,
    maxConcurrent = 3,
    onUploadComplete,
    onError,
  } = options;

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // 生成唯一文件名
  const generateFilePath = useCallback((file: File): string => {
    const uuid = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${editionId}/${uuid}_${safeName}`;
  }, [editionId]);

  // 更新单个文件状态
  const updateFileStatus = useCallback((
    fileId: string,
    updates: Partial<UploadingFile>
  ) => {
    setUploadingFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, ...updates } : f)
    );
  }, []);

  // 上传单个文件
  const uploadSingleFile = useCallback(async (
    uploadingFile: UploadingFile
  ): Promise<UploadedFile | null> => {
    const { id, file } = uploadingFile;

    try {
      let fileToUpload: File | Blob = file;
      let finalSize = file.size;

      // 检查是否需要压缩
      if (autoCompress && isImageFile(file) && needsCompression(file, compressionThresholdMB)) {
        updateFileStatus(id, { status: 'compressing' });

        try {
          const result = await compressImage(file, {
            maxSizeMB: compressionThresholdMB,
            quality: compressionQuality,
          });
          fileToUpload = result.blob;
          finalSize = result.compressedSize;
          updateFileStatus(id, { compressedSize: finalSize });
        } catch (compressError) {
          console.warn('压缩失败，使用原文件:', compressError);
        }
      }

      // 开始上传
      updateFileStatus(id, { status: 'uploading', progress: 10 });

      const filePath = generateFilePath(file);

      // 上传到 Supabase Storage
      const { path, error: uploadError } = await uploadFile(
        bucket,
        filePath,
        fileToUpload as File,
        { upsert: false }
      );

      if (uploadError) {
        throw uploadError;
      }

      updateFileStatus(id, { progress: 70 });

      // 创建数据库记录
      const fileType = detectFileType(file) as FileType;
      const insertData: EditionFilesInsert = {
        edition_id: editionId,
        source_type: 'upload',
        file_url: path,
        file_type: fileType,
        file_name: file.name,
        file_size: finalSize,
        description: null,
        sort_order: 0,
      };
      const { data: dbRecord, error: dbError } = await insertIntoTable('edition_files', insertData);

      if (dbError) {
        // 如果数据库记录失败，删除已上传的文件
        await deleteFile(bucket, [path]);
        throw dbError;
      }

      updateFileStatus(id, { progress: 90 });

      // 记录历史
      const historyData: EditionHistoryInsert = {
        edition_id: editionId,
        action: 'file_added',
        notes: `添加文件: ${file.name}`,
      };
      await insertIntoTableNoReturn('edition_history', historyData);

      // 更新版本的 updated_at
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('editions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', editionId);

      updateFileStatus(id, { status: 'complete', progress: 100 });

      return dbRecord as UploadedFile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '上传失败';
      updateFileStatus(id, { status: 'error', error: errorMessage });
      onError?.(errorMessage, file);
      return null;
    }
  }, [
    autoCompress,
    bucket,
    compressionQuality,
    compressionThresholdMB,
    editionId,
    generateFilePath,
    onError,
    updateFileStatus,
  ]);

  // 批量上传文件
  const uploadFiles = useCallback(async (files: File[]): Promise<UploadedFile[]> => {
    if (files.length === 0) return [];

    setIsUploading(true);

    // 创建上传任务
    const uploadTasks: UploadingFile[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending' as const,
      originalSize: file.size,
    }));

    setUploadingFiles(prev => [...prev, ...uploadTasks]);

    const results: UploadedFile[] = [];

    // 简化的并发上传逻辑
    const uploadWithLimit = async (tasks: UploadingFile[], limit: number) => {
      const executing = new Set<Promise<void>>();

      for (const task of tasks) {
        const promise = uploadSingleFile(task).then(result => {
          if (result) {
            results.push(result);
            onUploadComplete?.(result);
          }
          executing.delete(promise);
        });

        executing.add(promise);

        if (executing.size >= limit) {
          await Promise.race(executing);
        }
      }

      // 等待剩余任务完成
      await Promise.all(executing);
    };

    await uploadWithLimit(uploadTasks, maxConcurrent);

    setIsUploading(false);
    return results;
  }, [maxConcurrent, onUploadComplete, uploadSingleFile]);

  // 取消上传（移除待处理的文件）
  const cancelUpload = useCallback((fileId: string) => {
    setUploadingFiles(prev =>
      prev.filter(f => f.id !== fileId || f.status === 'uploading')
    );
  }, []);

  // 清除已完成/失败的文件
  const clearCompleted = useCallback(() => {
    setUploadingFiles(prev =>
      prev.filter(f => f.status !== 'complete' && f.status !== 'error')
    );
  }, []);

  // 重试失败的上传
  const retryFailed = useCallback(async () => {
    const failedFiles = uploadingFiles.filter(f => f.status === 'error');
    if (failedFiles.length === 0) return;

    // 重置状态
    for (const f of failedFiles) {
      updateFileStatus(f.id, { status: 'pending', progress: 0, error: undefined });
    }

    // 重新上传
    await Promise.all(failedFiles.map(f => uploadSingleFile(f)));
  }, [uploadingFiles, updateFileStatus, uploadSingleFile]);

  return {
    uploadFiles,
    uploadingFiles,
    isUploading,
    cancelUpload,
    clearCompleted,
    retryFailed,
    formatFileSize,
  };
}
