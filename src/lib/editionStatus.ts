import type { EditionStatus } from './types';

/**
 * Edition 状态流转工具函数
 * 管理版本状态的有效转换规则
 */

// 终态（不可再转换到其他状态）
const TERMINAL_STATUSES: readonly EditionStatus[] = ['sold', 'gifted', 'lost', 'damaged'];

// 需要位置信息的状态
const LOCATION_REQUIRED_STATUSES: readonly EditionStatus[] = [
  'in_studio',
  'at_gallery',
  'at_museum',
];

// 有效的状态转换规则
const VALID_TRANSITIONS: Record<EditionStatus, readonly EditionStatus[]> = {
  // 制作中 → 工作室或损坏
  in_production: ['in_studio', 'damaged'],

  // 工作室 → 可以去任何地方
  in_studio: ['at_gallery', 'at_museum', 'in_transit', 'sold', 'gifted', 'lost', 'damaged'],

  // 画廊 → 可回工作室、运输中、或终态
  at_gallery: ['in_studio', 'in_transit', 'sold', 'gifted', 'lost', 'damaged'],

  // 美术馆 → 可回工作室、运输中、或终态
  at_museum: ['in_studio', 'in_transit', 'sold', 'gifted', 'lost', 'damaged'],

  // 运输中 → 可到达目的地或意外
  in_transit: ['in_studio', 'at_gallery', 'at_museum', 'lost', 'damaged'],

  // 终态 - 不可转换
  sold: [],
  gifted: [],
  lost: [],
  damaged: [],
};

/**
 * 检查状态转换是否有效
 * @param from 当前状态
 * @param to 目标状态
 * @returns 转换是否有效
 */
export function isValidTransition(from: EditionStatus, to: EditionStatus): boolean {
  // 相同状态不算转换
  if (from === to) {
    return false;
  }
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * 检查是否为终态
 * @param status 状态
 * @returns 是否为终态
 */
export function isTerminalStatus(status: EditionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * 获取可转换的目标状态列表
 * @param current 当前状态
 * @returns 可转换的状态数组
 */
export function getValidNextStatuses(current: EditionStatus): EditionStatus[] {
  return [...VALID_TRANSITIONS[current]];
}

/**
 * 检查状态是否需要位置信息
 * @param status 状态
 * @returns 是否需要位置
 */
export function requiresLocation(status: EditionStatus): boolean {
  return LOCATION_REQUIRED_STATUSES.includes(status);
}

/**
 * 获取所有终态
 * @returns 终态数组
 */
export function getTerminalStatuses(): EditionStatus[] {
  return [...TERMINAL_STATUSES];
}

/**
 * 获取所有需要位置的状态
 * @returns 需要位置的状态数组
 */
export function getLocationRequiredStatuses(): EditionStatus[] {
  return [...LOCATION_REQUIRED_STATUSES];
}
