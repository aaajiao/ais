/**
 * 位置管理页面
 * 独立管理所有位置的增删改查
 */

import { useState, useCallback, useEffect } from 'react';
import { useLocations, type Location } from '@/hooks/useLocations';
import type { LocationType } from '@/lib/database.types';
import LocationDialog from '@/components/editions/LocationDialog';
import LocationItem from '@/components/locations/LocationItem';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// 位置类型信息
const LOCATION_TYPE_INFO: Record<LocationType, { label: string; icon: string }> = {
  studio: { label: '工作室', icon: '🏠' },
  gallery: { label: '画廊', icon: '🖼' },
  museum: { label: '美术馆', icon: '🏛' },
  other: { label: '其他', icon: '📍' },
};

export default function Locations() {
  const {
    locations,
    locationsByType,
    isLoading,
    error,
    deleteLocation,
    refetch,
  } = useLocations();

  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationUsage, setLocationUsage] = useState<Record<string, number>>({});

  // 加载每个位置的使用次数
  useEffect(() => {
    const loadUsageCounts = async () => {
      if (locations.length === 0) return;

      const { data, error: fetchError } = await supabase
        .from('editions')
        .select('location_id')
        .not('location_id', 'is', null);

      if (fetchError) {
        console.error('加载使用次数失败:', fetchError);
        return;
      }

      // 统计每个位置被引用的次数
      const counts: Record<string, number> = {};
      for (const edition of data || []) {
        if (edition.location_id) {
          counts[edition.location_id] = (counts[edition.location_id] || 0) + 1;
        }
      }
      setLocationUsage(counts);
    };

    loadUsageCounts();
  }, [locations]);

  // 打开创建对话框
  const handleCreate = useCallback(() => {
    setEditingLocation(null);
    setDialogMode('create');
    setShowDialog(true);
  }, []);

  // 打开编辑对话框
  const handleEdit = useCallback((location: Location) => {
    setEditingLocation(location);
    setDialogMode('edit');
    setShowDialog(true);
  }, []);

  // 删除位置
  const handleDelete = useCallback(async (location: Location) => {
    try {
      await deleteLocation(location.id);
      toast.success(`位置 "${location.name}" 已删除`);
    } catch (err) {
      // 错误会在 LocationItem 中显示
      throw err;
    }
  }, [deleteLocation]);

  // 对话框关闭
  const handleDialogClose = useCallback(() => {
    setShowDialog(false);
    setEditingLocation(null);
  }, []);

  // 对话框保存成功
  const handleDialogSaved = useCallback(() => {
    setShowDialog(false);
    setEditingLocation(null);
    refetch();
  }, [refetch]);

  // 过滤位置
  const filterLocations = useCallback((locs: Location[]) => {
    if (!searchQuery.trim()) return locs;
    const query = searchQuery.toLowerCase();
    return locs.filter(loc =>
      loc.name.toLowerCase().includes(query) ||
      loc.aliases?.some(a => a.toLowerCase().includes(query)) ||
      loc.city?.toLowerCase().includes(query) ||
      loc.country?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // 统计信息
  const totalLocations = locations.length;
  const typeCounts = Object.entries(locationsByType).reduce((acc, [type, locs]) => {
    acc[type as LocationType] = locs.length;
    return acc;
  }, {} as Record<LocationType, number>);

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded"></div>
          <div className="h-12 bg-muted rounded"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">位置管理</h1>
          <p className="text-muted-foreground mt-1">
            管理作品存放的位置，共 {totalLocations} 个位置
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加位置
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(['studio', 'gallery', 'museum', 'other'] as LocationType[]).map(type => (
          <div
            key={type}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{LOCATION_TYPE_INFO[type].icon}</span>
              <span className="text-sm text-muted-foreground">{LOCATION_TYPE_INFO[type].label}</span>
            </div>
            <p className="text-2xl font-semibold">{typeCounts[type] || 0}</p>
          </div>
        ))}
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索位置名称、别名、城市..."
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 位置列表 */}
      {totalLocations === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📍</div>
          <h3 className="text-lg font-medium mb-2">还没有位置</h3>
          <p className="text-muted-foreground mb-4">
            添加工作室、画廊、美术馆等位置来管理作品存放
          </p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            添加第一个位置
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {(['studio', 'gallery', 'museum', 'other'] as LocationType[]).map(type => {
            const filteredLocs = filterLocations(locationsByType[type] || []);
            if (filteredLocs.length === 0) return null;

            return (
              <div key={type}>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <span>{LOCATION_TYPE_INFO[type].icon}</span>
                  <span>{LOCATION_TYPE_INFO[type].label}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {filteredLocs.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {filteredLocs.map(location => (
                    <LocationItem
                      key={location.id}
                      location={location}
                      usageCount={locationUsage[location.id]}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 位置对话框 */}
      <LocationDialog
        isOpen={showDialog}
        onClose={handleDialogClose}
        onSaved={handleDialogSaved}
        editingLocation={editingLocation}
        mode={dialogMode}
      />
    </div>
  );
}
