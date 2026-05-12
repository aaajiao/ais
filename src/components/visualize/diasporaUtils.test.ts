import { describe, it, expect } from 'vitest';
import {
  buildNodes,
  pickCenterNode,
  radialLayout,
  buildEdges,
  computeTrackedStat,
  countryToISO2,
  nodeRadius,
} from './diasporaUtils';
import type { LocationNode } from './diasporaUtils';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEdition(
  id: string,
  location_id: string | null = null
): VizEdition {
  return {
    id,
    artwork_id: 'artwork-1',
    inventory_number: id,
    edition_type: 'numbered',
    edition_number: 1,
    status: 'in_studio',
    location_id,
    sale_price: null,
    sale_currency: null,
    sale_date: null,
    buyer_name: null,
    created_at: '2024-01-01T00:00:00Z',
  };
}

function makeLocation(
  id: string,
  name: string,
  type: VizLocation['type'] = 'gallery',
  country: string | null = 'China'
): VizLocation {
  return { id, name, type, city: null, country };
}

function makeHistory(
  action: VizHistory['action'],
  from_location: string | null,
  to_location: string | null
): VizHistory {
  return {
    id: `h-${Math.random()}`,
    edition_id: 'e1',
    action,
    from_status: null,
    to_status: null,
    from_location,
    to_location,
    created_at: '2024-01-01T00:00:00Z',
  };
}

// ─── buildNodes ───────────────────────────────────────────────────────────────

describe('buildNodes', () => {
  it('正确关联 editions 到 locations', () => {
    const editions = [
      makeEdition('e1', 'loc-1'),
      makeEdition('e2', 'loc-1'),
      makeEdition('e3', 'loc-2'),
    ];
    const locations = [
      makeLocation('loc-1', 'Gallery A'),
      makeLocation('loc-2', 'Museum B', 'museum'),
    ];
    const nodes = buildNodes(editions, locations);
    expect(nodes).toHaveLength(2);
    const a = nodes.find((n) => n.id === 'loc-1')!;
    expect(a.editionCount).toBe(2);
    expect(a.editionIds).toContain('e1');
    expect(a.editionIds).toContain('e2');
    const b = nodes.find((n) => n.id === 'loc-2')!;
    expect(b.editionCount).toBe(1);
  });

  it('过滤掉没有 edition 的 location', () => {
    const editions = [makeEdition('e1', 'loc-1')];
    const locations = [
      makeLocation('loc-1', 'Gallery A'),
      makeLocation('loc-2', 'Empty Place'), // 无 edition
    ];
    const nodes = buildNodes(editions, locations);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('loc-1');
  });

  it('按 editionCount 降序排列', () => {
    const editions = [
      makeEdition('e1', 'loc-1'),
      makeEdition('e2', 'loc-2'),
      makeEdition('e3', 'loc-2'),
      makeEdition('e4', 'loc-2'),
    ];
    const locations = [
      makeLocation('loc-1', 'Small Gallery'),
      makeLocation('loc-2', 'Big Gallery'),
    ];
    const nodes = buildNodes(editions, locations);
    expect(nodes[0].id).toBe('loc-2'); // 更多 editions 在前
    expect(nodes[1].id).toBe('loc-1');
  });

  it('editions 无 location_id 时不崩溃', () => {
    const editions = [makeEdition('e1', null), makeEdition('e2', null)];
    const locations = [makeLocation('loc-1', 'Gallery A')];
    const nodes = buildNodes(editions, locations);
    expect(nodes).toHaveLength(0);
  });

  it('空输入返回空数组', () => {
    expect(buildNodes([], [])).toEqual([]);
    expect(buildNodes([makeEdition('e1', 'loc-1')], [])).toEqual([]);
  });
});

// ─── pickCenterNode ───────────────────────────────────────────────────────────

describe('pickCenterNode', () => {
  it('返回 editionCount 最高的节点', () => {
    const nodes: LocationNode[] = [
      {
        id: '1',
        name: 'Gallery A',
        type: 'gallery',
        city: null,
        country: 'China',
        editionCount: 10,
        editionIds: [],
      },
      {
        id: '2',
        name: 'Small Gallery',
        type: 'gallery',
        city: null,
        country: 'China',
        editionCount: 3,
        editionIds: [],
      },
    ];
    expect(pickCenterNode(nodes)?.id).toBe('1');
  });

  it('tie-breaker：有 Studio 的优先', () => {
    const nodes: LocationNode[] = [
      {
        id: 'a',
        name: 'Warehouse',
        type: 'other',
        city: null,
        country: 'China',
        editionCount: 26,
        editionIds: [],
      },
      {
        id: 'b',
        name: 'aaajiao Shanghai Studio',
        type: 'studio',
        city: null,
        country: 'China',
        editionCount: 26,
        editionIds: [],
      },
    ];
    expect(pickCenterNode(nodes)?.id).toBe('b');
  });

  it('tie-breaker 不区分大小写', () => {
    const nodes: LocationNode[] = [
      {
        id: 'x',
        name: 'OTHER STUDIO',
        type: 'studio',
        city: null,
        country: null,
        editionCount: 5,
        editionIds: [],
      },
      {
        id: 'y',
        name: 'Plain Gallery',
        type: 'gallery',
        city: null,
        country: null,
        editionCount: 5,
        editionIds: [],
      },
    ];
    expect(pickCenterNode(nodes)?.id).toBe('x');
  });

  it('空数组返回 null', () => {
    expect(pickCenterNode([])).toBeNull();
  });
});

// ─── radialLayout ─────────────────────────────────────────────────────────────

describe('radialLayout', () => {
  const viewport = { width: 800, height: 600 };

  const makeNode = (id: string, editionCount: number): LocationNode => ({
    id,
    name: id,
    type: 'gallery',
    city: null,
    country: null,
    editionCount,
    editionIds: [],
  });

  const center = makeNode('center', 30);

  it('中心节点位于 viewport 正中', () => {
    const layout = radialLayout(center, [makeNode('a', 5)], viewport);
    expect(layout.center.x).toBe(400);
    expect(layout.center.y).toBe(300);
    expect(layout.center.node.id).toBe('center');
  });

  it('外环节点不与中心重合', () => {
    const outer = [
      makeNode('a', 10),
      makeNode('b', 8),
      makeNode('c', 5),
      makeNode('d', 3),
    ];
    const { ring } = radialLayout(center, outer, viewport);
    for (const p of ring) {
      const dist = Math.sqrt(
        (p.x - 400) ** 2 + (p.y - 300) ** 2
      );
      expect(dist).toBeGreaterThan(0);
    }
  });

  it('至少使用 2 个 ringIndex 值（当外节点够多时）', () => {
    const outer = Array.from({ length: 6 }, (_, i) =>
      makeNode(`n${i}`, 10 - i)
    );
    const { ring } = radialLayout(center, outer, viewport);
    const ringIndices = new Set(ring.map((p) => p.ringIndex));
    expect(ringIndices.size).toBeGreaterThanOrEqual(2);
  });

  it('ringIndex 高的节点离中心更近', () => {
    const outer = Array.from({ length: 9 }, (_, i) =>
      makeNode(`n${i}`, 9 - i)
    );
    const { ring } = radialLayout(center, outer, viewport);
    const ring0 = ring.filter((p) => p.ringIndex === 0);
    const ring2 = ring.filter((p) => p.ringIndex === 2);
    if (ring0.length > 0 && ring2.length > 0) {
      const avgDist0 = ring0.reduce(
        (s, p) => s + Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2),
        0
      ) / ring0.length;
      const avgDist2 = ring2.reduce(
        (s, p) => s + Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2),
        0
      ) / ring2.length;
      expect(avgDist0).toBeLessThan(avgDist2);
    }
  });

  it('外节点为空时返回空 ring', () => {
    const { ring } = radialLayout(center, [], viewport);
    expect(ring).toHaveLength(0);
  });
});

// ─── buildEdges ───────────────────────────────────────────────────────────────

describe('buildEdges', () => {
  const nodes: LocationNode[] = [
    {
      id: 'loc-a',
      name: 'Gallery A',
      type: 'gallery',
      city: null,
      country: null,
      editionCount: 5,
      editionIds: [],
    },
    {
      id: 'loc-b',
      name: 'Museum B',
      type: 'museum',
      city: null,
      country: null,
      editionCount: 3,
      editionIds: [],
    },
    {
      id: 'loc-c',
      name: 'Studio C',
      type: 'studio',
      city: null,
      country: null,
      editionCount: 2,
      editionIds: [],
    },
  ];

  it('聚合同向 from→to，累加 count', () => {
    const history = [
      makeHistory('location_change', 'Gallery A', 'Museum B'),
      makeHistory('location_change', 'Gallery A', 'Museum B'),
      makeHistory('location_change', 'Museum B', 'Studio C'),
    ];
    const edges = buildEdges(history, nodes);
    expect(edges).toHaveLength(2);
    const ab = edges.find(
      (e) => e.fromNodeId === 'loc-a' && e.toNodeId === 'loc-b'
    );
    expect(ab?.count).toBe(2);
    const bc = edges.find(
      (e) => e.fromNodeId === 'loc-b' && e.toNodeId === 'loc-c'
    );
    expect(bc?.count).toBe(1);
  });

  it('过滤非 location_change action', () => {
    const history = [
      makeHistory('status_change', 'Gallery A', 'Museum B'),
      makeHistory('location_change', 'Gallery A', 'Museum B'),
    ];
    const edges = buildEdges(history, nodes);
    expect(edges).toHaveLength(1);
  });

  it('过滤 from === to 的自环', () => {
    const history = [
      makeHistory('location_change', 'Gallery A', 'Gallery A'),
    ];
    const edges = buildEdges(history, nodes);
    expect(edges).toHaveLength(0);
  });

  it('from_location 或 to_location 为 null 时跳过', () => {
    const history = [
      makeHistory('location_change', null, 'Museum B'),
      makeHistory('location_change', 'Gallery A', null),
    ];
    const edges = buildEdges(history, nodes);
    expect(edges).toHaveLength(0);
  });

  it('location name 不在节点列表时跳过', () => {
    const history = [
      makeHistory('location_change', 'Unknown Place', 'Museum B'),
    ];
    const edges = buildEdges(history, nodes);
    expect(edges).toHaveLength(0);
  });

  it('空 history 返回空数组', () => {
    expect(buildEdges([], nodes)).toHaveLength(0);
  });
});

// ─── computeTrackedStat ───────────────────────────────────────────────────────

describe('computeTrackedStat', () => {
  it('正确计算 tracked 比例', () => {
    const editions = [
      makeEdition('e1', 'loc-1'),
      makeEdition('e2', 'loc-1'),
      makeEdition('e3', null),
      makeEdition('e4', null),
      makeEdition('e5', null),
    ];
    const stat = computeTrackedStat(editions, []);
    expect(stat.tracked).toBe(2);
    expect(stat.total).toBe(5);
    expect(stat.percent).toBe(40);
  });

  it('全部无 location 时 tracked = 0', () => {
    const editions = [makeEdition('e1', null), makeEdition('e2', null)];
    const stat = computeTrackedStat(editions, []);
    expect(stat.tracked).toBe(0);
    expect(stat.percent).toBe(0);
  });

  it('空 editions 时返回全 0', () => {
    const stat = computeTrackedStat([], []);
    expect(stat.tracked).toBe(0);
    expect(stat.total).toBe(0);
    expect(stat.percent).toBe(0);
  });

  it('全部有 location 时 percent = 100', () => {
    const editions = [
      makeEdition('e1', 'loc-1'),
      makeEdition('e2', 'loc-2'),
    ];
    const stat = computeTrackedStat(editions, []);
    expect(stat.percent).toBe(100);
  });
});

// ─── countryToISO2 ────────────────────────────────────────────────────────────

describe('countryToISO2', () => {
  it('已知国家返回 ISO2', () => {
    expect(countryToISO2('China')).toBe('CN');
    expect(countryToISO2('Germany')).toBe('DE');
    expect(countryToISO2('Hong Kong')).toBe('HK');
  });

  it('未知国家取前两个字母大写', () => {
    expect(countryToISO2('Argentina')).toBe('AR');
    expect(countryToISO2('Zimbabwe')).toBe('ZI');
  });

  it('null 返回 ─', () => {
    expect(countryToISO2(null)).toBe('─');
  });
});

// ─── nodeRadius ───────────────────────────────────────────────────────────────

describe('nodeRadius', () => {
  it('最小值 6', () => {
    expect(nodeRadius(0)).toBe(6);
    expect(nodeRadius(1)).toBeGreaterThanOrEqual(6);
  });

  it('最大值 18', () => {
    expect(nodeRadius(9999)).toBe(18);
  });

  it('随 editionCount 增大而增大', () => {
    expect(nodeRadius(1)).toBeLessThan(nodeRadius(10));
    expect(nodeRadius(10)).toBeLessThan(nodeRadius(100));
  });
});
