import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Database, EditionStatus } from '@/lib/database.types';
import ExportDialog from '@/components/export/ExportDialog';
import { StatusIndicator, getStatusLabel } from '@/components/ui/StatusIndicator';
import { Image } from 'lucide-react';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];
type Location = Database['public']['Tables']['locations']['Row'];

interface EditionWithLocation extends Edition {
  location?: Location | null;
}

// 编辑表单数据类型
interface ArtworkFormData {
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

export default function ArtworkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [editions, setEditions] = useState<EditionWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ArtworkFormData | null>(null);

  // 添加版本状态
  const [showAddEdition, setShowAddEdition] = useState(false);
  const [addingEdition, setAddingEdition] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [newEdition, setNewEdition] = useState({
    edition_type: 'numbered' as 'numbered' | 'ap' | 'unique',
    edition_number: 1,
    status: 'in_studio' as EditionStatus,
    inventory_number: '',
    notes: '',
  });

  useEffect(() => {
    const fetchArtworkDetail = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

        // 获取作品详情（排除已删除的）
        const { data: artworkData, error: artworkError } = await supabase
          .from('artworks')
          .select('*')
          .eq('id', id)
          .is('deleted_at', null)
          .single();

        if (artworkError) throw artworkError;
        setArtwork(artworkData);

        // 获取版本列表
        const { data: editionsData, error: editionsError } = await supabase
          .from('editions')
          .select('*')
          .eq('artwork_id', id)
          .order('edition_number', { ascending: true })
          .returns<Edition[]>();

        if (editionsError) throw editionsError;

        // 获取位置信息
        const locationIds = [...new Set((editionsData || []).map((e: Edition) => e.location_id).filter(Boolean))];
        let locationsMap: Record<string, Location> = {};

        if (locationIds.length > 0) {
          const { data: locationsData, error: locationsError } = await supabase
            .from('locations')
            .select('*')
            .in('id', locationIds)
            .returns<Location[]>();

          if (!locationsError && locationsData) {
            locationsMap = locationsData.reduce((acc: Record<string, Location>, loc: Location) => {
              acc[loc.id] = loc;
              return acc;
            }, {} as Record<string, Location>);
          }
        }

        // 合并版本和位置数据
        const editionsWithLocation: EditionWithLocation[] = (editionsData || []).map((edition: Edition) => ({
          ...edition,
          location: edition.location_id ? locationsMap[edition.location_id] : null,
        }));

        setEditions(editionsWithLocation);
      } catch (err) {
        console.error('获取作品详情失败:', err);
        setError(err instanceof Error ? err.message : '获取作品详情失败');
      } finally {
        setLoading(false);
      }
    };

    fetchArtworkDetail();
  }, [id]);

  // 格式化版本号
  const formatEditionNumber = (edition: Edition): string => {
    if (edition.edition_type === 'unique') return '独版';
    if (edition.edition_type === 'ap') return `AP${edition.edition_number || ''}`;
    return `${edition.edition_number || '?'}/${artwork?.edition_total || '?'}`;
  };

  // 开始编辑
  const startEditing = () => {
    if (!artwork) return;
    setFormData({
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
    });
    setIsEditing(true);
  };

  // 取消编辑
  const cancelEditing = () => {
    setIsEditing(false);
    setFormData(null);
  };

  // 保存编辑
  const saveEditing = async () => {
    if (!id || !formData) return;

    try {
      setSaving(true);
      const updateData = {
        title_en: formData.title_en,
        title_cn: formData.title_cn || null,
        year: formData.year || null,
        type: formData.type || null,
        materials: formData.materials || null,
        dimensions: formData.dimensions || null,
        duration: formData.duration || null,
        edition_total: formData.edition_total || null,
        ap_total: formData.ap_total || null,
        is_unique: formData.is_unique,
        source_url: formData.source_url || null,
        thumbnail_url: formData.thumbnail_url || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('artworks')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;

      // 更新本地状态
      setArtwork(prev => prev ? {
        ...prev,
        title_en: formData.title_en,
        title_cn: formData.title_cn || null,
        year: formData.year || null,
        type: formData.type || null,
        materials: formData.materials || null,
        dimensions: formData.dimensions || null,
        duration: formData.duration || null,
        edition_total: formData.edition_total || null,
        ap_total: formData.ap_total || null,
        is_unique: formData.is_unique,
        source_url: formData.source_url || null,
        thumbnail_url: formData.thumbnail_url || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      } : null);
      setIsEditing(false);
      setFormData(null);
    } catch (err) {
      console.error('保存失败:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 添加版本
  const handleAddEdition = async () => {
    if (!id || !artwork) return;

    try {
      setAddingEdition(true);

      const insertData = {
        artwork_id: id,
        edition_type: newEdition.edition_type,
        edition_number: newEdition.edition_type === 'unique' ? null : newEdition.edition_number,
        status: newEdition.status,
        inventory_number: newEdition.inventory_number || null,
        notes: newEdition.notes || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: insertError } = await (supabase as any)
        .from('editions')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      // 添加到本地列表
      if (data) {
        setEditions(prev => [...prev, { ...data, location: null } as EditionWithLocation]);
      }

      // 重置表单
      setNewEdition({
        edition_type: 'numbered',
        edition_number: editions.length + 1,
        status: 'in_studio',
        inventory_number: '',
        notes: '',
      });
      setShowAddEdition(false);
    } catch (err) {
      console.error('添加版本失败:', err);
      setError(err instanceof Error ? err.message : '添加版本失败');
    } finally {
      setAddingEdition(false);
    }
  };

  // 删除作品（软删除）
  const handleDelete = async () => {
    if (!id) return;

    try {
      setDeleting(true);

      // 软删除：设置 deleted_at 时间戳，保留所有数据
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from('artworks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (deleteError) throw deleteError;

      // 删除成功，返回作品列表
      navigate('/artworks', { replace: true });
    } catch (err) {
      console.error('删除作品失败:', err);
      setError(err instanceof Error ? err.message : '删除作品失败');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        {/* 骨架屏 */}
        <div className="h-8 w-24 bg-muted rounded mb-6 animate-pulse" />
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-64 h-64 bg-muted rounded-lg animate-pulse" />
            <div className="flex-1 space-y-4">
              <div className="h-8 bg-muted rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="p-6">
        <Link to="/artworks" className="text-primary hover:underline mb-6 inline-block">
          ← 返回作品列表
        </Link>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive">
          {error || '作品不存在'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 导出对话框 */}
      {id && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          artworkIds={[id]}
          artworkCount={1}
        />
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-muted-foreground mb-4">
              确定要删除作品「{artwork?.title_en}」吗？
              {editions.length > 0 && (
                <span className="block text-muted-foreground mt-2">
                  关联的 {editions.length} 个版本也将被隐藏。
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground mb-4">作品将被移至回收站，可在回收站中恢复。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 返回链接和操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/artworks" className="text-primary hover:underline">
          ← 返回作品列表
        </Link>
        <div className="flex gap-2">
          {!isEditing && (
            <>
              <button
                onClick={() => setShowExportDialog(true)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                导出
              </button>
              <button
                onClick={startEditing}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                编辑作品
              </button>
            </>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors"
          >
            删除作品
          </button>
        </div>
      </div>

      {/* 作品基本信息 */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        {isEditing && formData ? (
          /* 编辑模式 */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题 (英文) *</label>
                <input
                  type="text"
                  value={formData.title_en}
                  onChange={e => setFormData({ ...formData, title_en: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">标题 (中文)</label>
                <input
                  type="text"
                  value={formData.title_cn}
                  onChange={e => setFormData({ ...formData, title_cn: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">年份</label>
                <input
                  type="text"
                  value={formData.year}
                  onChange={e => setFormData({ ...formData, year: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">类型</label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder="Video installation"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">材料</label>
                <input
                  type="text"
                  value={formData.materials}
                  onChange={e => setFormData({ ...formData, materials: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">尺寸</label>
                <input
                  type="text"
                  value={formData.dimensions}
                  onChange={e => setFormData({ ...formData, dimensions: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">时长</label>
                <input
                  type="text"
                  value={formData.duration}
                  onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  placeholder="10:30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">缩略图 URL</label>
                <input
                  type="text"
                  value={formData.thumbnail_url}
                  onChange={e => setFormData({ ...formData, thumbnail_url: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">来源链接</label>
                <input
                  type="text"
                  value={formData.source_url}
                  onChange={e => setFormData({ ...formData, source_url: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={formData.is_unique}
                  onChange={e => setFormData({ ...formData, is_unique: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-medium">独版作品</span>
              </label>

              {!formData.is_unique && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">版数</label>
                    <input
                      type="number"
                      value={formData.edition_total}
                      onChange={e => setFormData({ ...formData, edition_total: parseInt(e.target.value) || 0 })}
                      min={0}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">AP 数</label>
                    <input
                      type="number"
                      value={formData.ap_total}
                      onChange={e => setFormData({ ...formData, ap_total: parseInt(e.target.value) || 0 })}
                      min={0}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">备注</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none resize-none"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={saveEditing}
                disabled={saving || !formData.title_en.trim()}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          /* 查看模式 */
          <div className="flex flex-col md:flex-row gap-6">
            {/* 缩略图 */}
            <div className="w-full md:w-64 h-64 bg-muted rounded-lg overflow-hidden flex-shrink-0">
              {artwork.thumbnail_url ? (
                <img
                  src={artwork.thumbnail_url}
                  alt={artwork.title_en}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Image className="w-12 h-12" />
                </div>
              )}
            </div>

            {/* 作品信息 */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2">
                {artwork.title_en}
                {artwork.title_cn && (
                  <span className="text-muted-foreground font-normal ml-2">
                    {artwork.title_cn}
                  </span>
                )}
              </h1>

              <div className="space-y-2 text-sm">
                {artwork.year && (
                  <p>
                    <span className="text-muted-foreground">年份：</span>
                    {artwork.year}
                  </p>
                )}
                {artwork.type && (
                  <p>
                    <span className="text-muted-foreground">类型：</span>
                    {artwork.type}
                  </p>
                )}
                {artwork.materials && (
                  <p>
                    <span className="text-muted-foreground">材料：</span>
                    {artwork.materials}
                  </p>
                )}
                {artwork.dimensions && (
                  <p>
                    <span className="text-muted-foreground">尺寸：</span>
                    {artwork.dimensions}
                  </p>
                )}
                {artwork.duration && (
                  <p>
                    <span className="text-muted-foreground">时长：</span>
                    {artwork.duration}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">版本：</span>
                  {artwork.is_unique ? '独版' : `${artwork.edition_total || 0} 版${artwork.ap_total ? ` + ${artwork.ap_total} AP` : ''}`}
                </p>
              </div>

              {artwork.source_url && (
                <a
                  href={artwork.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 text-primary hover:underline text-sm"
                >
                  查看原网站 →
                </a>
              )}

              {artwork.notes && (
                <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                  <p className="text-muted-foreground mb-1">备注：</p>
                  <p>{artwork.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 版本列表 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            版本列表 ({editions.length})
          </h2>
          <button
            onClick={() => setShowAddEdition(true)}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            + 添加版本
          </button>
        </div>

        {/* 添加版本表单 */}
        {showAddEdition && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
            <h3 className="font-medium mb-3">添加新版本</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">版本类型</label>
                <select
                  value={newEdition.edition_type}
                  onChange={e => setNewEdition({ ...newEdition, edition_type: e.target.value as 'numbered' | 'ap' | 'unique' })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="numbered">编号版</option>
                  <option value="ap">AP</option>
                  <option value="unique">独版</option>
                </select>
              </div>
              {newEdition.edition_type !== 'unique' && (
                <div>
                  <label className="block text-sm font-medium mb-1">版号</label>
                  <input
                    type="number"
                    value={newEdition.edition_number}
                    onChange={e => setNewEdition({ ...newEdition, edition_number: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">状态</label>
                <select
                  value={newEdition.status}
                  onChange={e => setNewEdition({ ...newEdition, status: e.target.value as EditionStatus })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="in_production">制作中</option>
                  <option value="in_studio">在库</option>
                  <option value="at_gallery">寄售</option>
                  <option value="at_museum">美术馆</option>
                  <option value="in_transit">运输中</option>
                  <option value="sold">已售</option>
                  <option value="gifted">赠送</option>
                  <option value="lost">遗失</option>
                  <option value="damaged">损坏</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">库存编号</label>
                <input
                  type="text"
                  value={newEdition.inventory_number}
                  onChange={e => setNewEdition({ ...newEdition, inventory_number: e.target.value })}
                  placeholder="AAJ-2025-001"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">备注</label>
                <input
                  type="text"
                  value={newEdition.notes}
                  onChange={e => setNewEdition({ ...newEdition, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowAddEdition(false)}
                disabled={addingEdition}
                className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleAddEdition}
                disabled={addingEdition}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {addingEdition ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        )}

        {editions.length === 0 && !showAddEdition ? (
          <div className="text-center text-muted-foreground py-8">
            暂无版本数据，点击上方按钮添加
          </div>
        ) : editions.length === 0 ? null : (
          <div className="space-y-3">
            {editions.map(edition => (
              <Link
                key={edition.id}
                to={`/editions/${edition.id}`}
                className="block p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIndicator status={edition.status} size="lg" />
                    <div>
                      <p className="font-medium">
                        {formatEditionNumber(edition)}
                        {edition.inventory_number && (
                          <span className="text-muted-foreground ml-2 text-sm">
                            #{edition.inventory_number}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {getStatusLabel(edition.status)}
                        {edition.location && (
                          <span> · {edition.location.name}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
