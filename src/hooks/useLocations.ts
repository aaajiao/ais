/**
 * 位置管理 Hook
 * 查询、搜索和创建位置
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, insertIntoTable, updateTable, type LocationsInsert, type LocationsUpdate } from '@/lib/supabase';
import type { LocationType } from '@/lib/database.types';

export interface Location {
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
}

export interface LocationSearchResult extends Location {
  matchedAlias?: string;  // 如果通过别名匹配，显示匹配的别名
  matchScore: number;     // 匹配分数（用于排序）
}

export interface CreateLocationData {
  name: string;
  type: LocationType;
  aliases?: string[];
  city?: string;
  country?: string;
  address?: string;
  contact?: string;
  notes?: string;
}

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载所有位置
  const fetchLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      setLocations(data as Location[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载位置失败';
      setError(message);
      console.error('加载位置失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // 搜索位置（本地搜索）
  const searchLocations = useCallback((
    query: string,
    filterType?: LocationType
  ): LocationSearchResult[] => {
    if (!query.trim()) {
      // 空查询返回所有位置
      return locations
        .filter(loc => !filterType || loc.type === filterType)
        .map(loc => ({ ...loc, matchScore: 0 }));
    }

    const lowerQuery = query.toLowerCase().trim();
    const results: LocationSearchResult[] = [];

    for (const loc of locations) {
      // 类型过滤
      if (filterType && loc.type !== filterType) continue;

      let matchScore = 0;
      let matchedAlias: string | undefined;

      // 检查名称匹配
      const lowerName = loc.name.toLowerCase();
      if (lowerName === lowerQuery) {
        matchScore = 100; // 精确匹配
      } else if (lowerName.startsWith(lowerQuery)) {
        matchScore = 80; // 前缀匹配
      } else if (lowerName.includes(lowerQuery)) {
        matchScore = 60; // 包含匹配
      }

      // 检查别名匹配
      if (loc.aliases && loc.aliases.length > 0) {
        for (const alias of loc.aliases) {
          const lowerAlias = alias.toLowerCase();
          if (lowerAlias === lowerQuery) {
            matchScore = Math.max(matchScore, 95); // 别名精确匹配
            matchedAlias = alias;
          } else if (lowerAlias.startsWith(lowerQuery)) {
            matchScore = Math.max(matchScore, 75);
            matchedAlias = alias;
          } else if (lowerAlias.includes(lowerQuery)) {
            matchScore = Math.max(matchScore, 55);
            matchedAlias = alias;
          }
        }
      }

      // 检查城市/国家匹配
      if (loc.city?.toLowerCase().includes(lowerQuery)) {
        matchScore = Math.max(matchScore, 40);
      }
      if (loc.country?.toLowerCase().includes(lowerQuery)) {
        matchScore = Math.max(matchScore, 30);
      }

      if (matchScore > 0) {
        results.push({
          ...loc,
          matchedAlias,
          matchScore,
        });
      }
    }

    // 按匹配分数排序
    return results.sort((a, b) => b.matchScore - a.matchScore);
  }, [locations]);

  // 根据 ID 获取位置
  const getLocationById = useCallback((id: string | null): Location | null => {
    if (!id) return null;
    return locations.find(loc => loc.id === id) || null;
  }, [locations]);

  // 创建新位置
  const createLocation = useCallback(async (
    data: CreateLocationData
  ): Promise<Location> => {
    const insertData: LocationsInsert = {
      name: data.name,
      type: data.type,
      aliases: data.aliases || [],
      city: data.city || null,
      country: data.country || null,
      address: data.address || null,
      contact: data.contact || null,
      notes: data.notes || null,
    };
    const { data: newLocation, error: createError } = await insertIntoTable('locations', insertData);

    if (createError) {
      throw new Error(createError.message);
    }

    // 更新本地状态
    setLocations(prev => [...prev, newLocation as Location]);

    return newLocation as Location;
  }, []);

  // 更新位置
  const updateLocation = useCallback(async (
    id: string,
    data: Partial<CreateLocationData>
  ): Promise<Location> => {
    // 构建更新对象，确保类型正确
    const updateData: LocationsUpdate = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.aliases !== undefined) updateData.aliases = data.aliases;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.country !== undefined) updateData.country = data.country || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.contact !== undefined) updateData.contact = data.contact || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;

    const { data: updated, error: updateError } = await updateTable('locations', updateData, id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // 更新本地状态
    setLocations(prev =>
      prev.map(loc => loc.id === id ? updated as Location : loc)
    );

    return updated as Location;
  }, []);

  // 添加别名
  const addAlias = useCallback(async (
    locationId: string,
    alias: string
  ): Promise<void> => {
    const location = locations.find(loc => loc.id === locationId);
    if (!location) throw new Error('位置不存在');

    const newAliases = [...(location.aliases || []), alias];

    await updateLocation(locationId, { aliases: newAliases });
  }, [locations, updateLocation]);

  // 删除别名
  const removeAlias = useCallback(async (
    locationId: string,
    alias: string
  ): Promise<void> => {
    const location = locations.find(loc => loc.id === locationId);
    if (!location) throw new Error('位置不存在');

    const newAliases = (location.aliases || []).filter(a => a !== alias);

    await updateLocation(locationId, { aliases: newAliases });
  }, [locations, updateLocation]);

  // 按类型分组
  const locationsByType = useMemo(() => {
    const grouped: Record<LocationType, Location[]> = {
      studio: [],
      gallery: [],
      museum: [],
      other: [],
    };

    for (const loc of locations) {
      grouped[loc.type].push(loc);
    }

    return grouped;
  }, [locations]);

  // 位置类型显示名称
  const typeLabels: Record<LocationType, string> = {
    studio: '工作室',
    gallery: '画廊',
    museum: '美术馆',
    other: '其他',
  };

  // 检查位置是否被版本引用
  const checkLocationUsage = useCallback(async (
    locationId: string
  ): Promise<{ isUsed: boolean; count: number }> => {
    const { count, error: countError } = await supabase
      .from('editions')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId);

    if (countError) {
      throw new Error(countError.message);
    }

    return { isUsed: (count || 0) > 0, count: count || 0 };
  }, []);

  // 删除位置（被引用时拒绝删除）
  const deleteLocation = useCallback(async (
    locationId: string
  ): Promise<void> => {
    // 先检查是否被引用
    const { isUsed, count } = await checkLocationUsage(locationId);
    if (isUsed) {
      throw new Error(`该位置被 ${count} 个版本引用，无法删除`);
    }

    const { error: deleteError } = await supabase
      .from('locations')
      .delete()
      .eq('id', locationId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // 更新本地状态
    setLocations(prev => prev.filter(loc => loc.id !== locationId));
  }, [checkLocationUsage]);

  return {
    locations,
    locationsByType,
    typeLabels,
    isLoading,
    error,
    searchLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation,
    checkLocationUsage,
    addAlias,
    removeAlias,
    refetch: fetchLocations,
  };
}
