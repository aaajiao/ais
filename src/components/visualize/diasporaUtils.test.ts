import { describe, it, expect } from 'vitest';
import {
  buildNodes,
  pickCenterNode,
  radialLayout,
  buildEdges,
  computeTrackedStat,
  countryToISO2,
  nodeRadius,
  getGhostNodes,
  buildConstellation,
  layoutConstellation,
  namedNodeRadius,
  TYPE_ARC_RANGES,
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
  location_id: string | null = null,
  overrides: Partial<VizEdition> = {}
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
    ...overrides,
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

// ─── M2: getGhostNodes ──────────────────────────────────────────────────────

describe('getGhostNodes', () => {
  it('无 location_id 的 edition 计入 count', () => {
    const editions = [
      makeEdition('e1', null),
      makeEdition('e2', null),
      makeEdition('e3', 'loc-1'),
    ];
    const ghost = getGhostNodes(editions, []);
    expect(ghost.count).toBe(2);
    expect(ghost.positions).toHaveLength(2);
  });

  it('全部有 location_id → count=0 且 positions 空数组（不画空环）', () => {
    const editions = [makeEdition('e1', 'loc-1'), makeEdition('e2', 'loc-2')];
    const ghost = getGhostNodes(editions, []);
    expect(ghost.count).toBe(0);
    expect(ghost.positions).toEqual([]);
  });

  it('空输入 → count=0', () => {
    expect(getGhostNodes([], [])).toEqual({ count: 0, positions: [] });
  });

  it('位置均匀分布在大半径上（每个点到中心距离 = radius）', () => {
    const editions = Array.from({ length: 8 }, (_, i) =>
      makeEdition(`e${i}`, null)
    );
    const cx = 400;
    const cy = 280;
    const radius = 250;
    const { positions } = getGhostNodes(editions, [], { cx, cy, radius });
    for (const p of positions) {
      const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      expect(d).toBeCloseTo(radius, 4);
    }
  });

  it('首个 ghost 在 12 点钟方向（angle = -π/2 → x=cx, y=cy-radius）', () => {
    const editions = [makeEdition('e1', null)];
    const { positions } = getGhostNodes(editions, [], {
      cx: 100,
      cy: 100,
      radius: 50,
    });
    expect(positions[0].x).toBeCloseTo(100, 4);
    expect(positions[0].y).toBeCloseTo(50, 4); // 12 点钟 = 上方
  });
});

// ─── M6: buildConstellation ────────────────────────────────────────────────

describe('buildConstellation', () => {
  it('空 editions → 空 Constellation（artist outflow=0, locations=[], namedPrivate=[], anonymous=0）', () => {
    const c = buildConstellation([], []);
    expect(c.artist.kind).toBe('artist');
    expect(c.artist.id).toBe('aaajiao');
    expect(c.artist.totalOutflowCount).toBe(0);
    expect(c.locations).toEqual([]);
    expect(c.namedPrivateBuyers).toEqual([]);
    expect(c.anonymous.count).toBe(0);
    expect(c.anonymous.editionIds).toEqual([]);
    expect(c.anonymous.artworkIds).toEqual([]);
  });

  it('单 non-studio location + sold edition → 1 个 LocationConstellationNode', () => {
    const editions = [
      makeEdition('e1', 'loc-gallery', { status: 'sold' }),
    ];
    const locations = [makeLocation('loc-gallery', 'Berlin Gallery', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.locations).toHaveLength(1);
    expect(c.locations[0].id).toBe('loc-gallery');
    expect(c.locations[0].editionCount).toBe(1);
    expect(c.locations[0].editionIds).toEqual(['e1']);
    expect(c.locations[0].type).toBe('gallery');
    expect(c.artist.totalOutflowCount).toBe(1);
    expect(c.namedPrivateBuyers).toEqual([]);
    expect(c.anonymous.count).toBe(0);
  });

  it('多 location + 多 sold edition → 按 editionCount desc 排列 + 类型分弧度', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold' }),
      makeEdition('e2', 'loc-g1', { status: 'sold' }),
      makeEdition('e3', 'loc-g1', { status: 'sold' }),
      makeEdition('e4', 'loc-m1', { status: 'sold' }),
      makeEdition('e5', 'loc-p1', { status: 'sold' }),
      makeEdition('e6', 'loc-p1', { status: 'sold' }),
    ];
    const locations = [
      makeLocation('loc-g1', 'Gallery A', 'gallery'),
      makeLocation('loc-m1', 'Museum B', 'museum'),
      makeLocation('loc-p1', 'Akeroyd Collection', 'private_collection'),
    ];
    const c = buildConstellation(editions, locations);
    // 按 editionCount desc 排
    expect(c.locations.map((l) => l.id)).toEqual(['loc-g1', 'loc-p1', 'loc-m1']);
    expect(c.locations[0].editionCount).toBe(3);
    // type 字段透传
    expect(c.locations.find((l) => l.id === 'loc-m1')?.type).toBe('museum');
    expect(c.locations.find((l) => l.id === 'loc-p1')?.type).toBe(
      'private_collection'
    );
  });

  it('buyer_name 非空 + 无 location → NamedPrivateNode', () => {
    const editions = [
      makeEdition('e1', null, { status: 'sold', buyer_name: 'Liliana Gao' }),
    ];
    const c = buildConstellation(editions, []);
    expect(c.namedPrivateBuyers).toHaveLength(1);
    expect(c.namedPrivateBuyers[0].id).toBe('Liliana Gao');
    expect(c.namedPrivateBuyers[0].name).toBe('Liliana Gao');
    expect(c.namedPrivateBuyers[0].editionCount).toBe(1);
    expect(c.locations).toEqual([]);
    expect(c.anonymous.count).toBe(0);
  });

  it('buyer_name 重复 → 同一个 NamedPrivateNode + editionCount 累加（字面值不归一化）', () => {
    const editions = [
      makeEdition('e1', null, { status: 'sold', buyer_name: 'Liliana Gao' }),
      makeEdition('e2', null, { status: 'gifted', buyer_name: 'Liliana Gao' }),
      // 字面值不同 —— 不归一化合并
      makeEdition('e3', null, {
        status: 'sold',
        buyer_name: 'Liliana Gao / 林奇',
      }),
    ];
    const c = buildConstellation(editions, []);
    expect(c.namedPrivateBuyers).toHaveLength(2);
    const liliana = c.namedPrivateBuyers.find((n) => n.id === 'Liliana Gao')!;
    expect(liliana.editionCount).toBe(2);
    expect(liliana.editionIds.sort()).toEqual(['e1', 'e2']);
    const lilianaLinQi = c.namedPrivateBuyers.find(
      (n) => n.id === 'Liliana Gao / 林奇'
    )!;
    expect(lilianaLinQi.editionCount).toBe(1);
  });

  it('复杂关系：location=museum + buyer_name 非空 → 归 location（步骤 1 优先）', () => {
    const editions = [
      makeEdition('e1', 'loc-m1', {
        status: 'sold',
        buyer_name: 'Uli Sigg',
      }),
    ];
    const locations = [makeLocation('loc-m1', 'M+ Museum', 'museum')];
    const c = buildConstellation(editions, locations);
    expect(c.locations).toHaveLength(1);
    expect(c.locations[0].id).toBe('loc-m1');
    expect(c.namedPrivateBuyers).toEqual([]);
  });

  it('studio 边界 case：location=studio + buyer_name 非空 → 归 namedPrivate（步骤 2）', () => {
    // Leo Xu + aaajiao Shanghai Studio 真实场景：作品事实上卖给 Leo，
    // 但物理上仍在 artist studio 寄存 —— 归 named private 而不是 studio location。
    const editions = [
      makeEdition('e1', 'loc-studio', {
        status: 'sold',
        buyer_name: 'Leo Xu',
      }),
    ];
    const locations = [
      makeLocation('loc-studio', 'aaajiao Shanghai Studio', 'studio'),
    ];
    const c = buildConstellation(editions, locations);
    expect(c.locations).toEqual([]);
    expect(c.namedPrivateBuyers).toHaveLength(1);
    expect(c.namedPrivateBuyers[0].id).toBe('Leo Xu');
  });

  it('匿名：status=sold + 无 buyer_name + 无 location_id → AnonymousAggregate', () => {
    const editions = [
      makeEdition('e1', null, { status: 'sold' }),
      makeEdition('e2', null, { status: 'gifted' }),
    ];
    const c = buildConstellation(editions, []);
    expect(c.anonymous.count).toBe(2);
    expect(c.anonymous.editionIds.sort()).toEqual(['e1', 'e2']);
    expect(c.locations).toEqual([]);
    expect(c.namedPrivateBuyers).toEqual([]);
  });

  it('status 过滤：in_studio / at_gallery / at_museum / in_transit 不进 Constellation', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'in_studio' }),
      makeEdition('e2', 'loc-g1', { status: 'at_gallery' }),
      makeEdition('e3', 'loc-g1', { status: 'at_museum' }),
      makeEdition('e4', 'loc-g1', { status: 'in_transit' }),
      makeEdition('e5', 'loc-g1', { status: 'in_production' }),
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.artist.totalOutflowCount).toBe(0);
    expect(c.locations).toEqual([]);
  });

  it('lost / damaged editions 不进 Constellation（degenerate 不算 outflow）', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'lost' }),
      makeEdition('e2', 'loc-g1', { status: 'damaged' }),
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.artist.totalOutflowCount).toBe(0);
    expect(c.locations).toEqual([]);
  });

  it('artworkIds 去重：同一买家买同一作品多个版本 → artworkIds 只 count 一次', () => {
    const editions = [
      makeEdition('e1', null, {
        artwork_id: 'art-1',
        status: 'sold',
        buyer_name: 'Buyer A',
      }),
      makeEdition('e2', null, {
        artwork_id: 'art-1',
        status: 'sold',
        buyer_name: 'Buyer A',
      }),
      makeEdition('e3', null, {
        artwork_id: 'art-2',
        status: 'sold',
        buyer_name: 'Buyer A',
      }),
    ];
    const c = buildConstellation(editions, []);
    const buyer = c.namedPrivateBuyers[0];
    expect(buyer.editionCount).toBe(3);
    expect(buyer.editionIds).toHaveLength(3); // editionIds 不去重
    expect(buyer.artworkIds.sort()).toEqual(['art-1', 'art-2']); // artwork 去重
  });

  it('editionIds 不去重：每个 edition 都是独立流出实例', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold' }),
      makeEdition('e2', 'loc-g1', { status: 'sold' }),
      makeEdition('e3', 'loc-g1', { status: 'gifted' }),
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.locations[0].editionIds.sort()).toEqual(['e1', 'e2', 'e3']);
    expect(c.locations[0].editionCount).toBe(3);
  });

  it('totalOutflowCount = sold + gifted 总数（跨桶）', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold' }),
      makeEdition('e2', null, { status: 'sold', buyer_name: 'Buyer' }),
      makeEdition('e3', null, { status: 'gifted' }), // anonymous
      makeEdition('e4', 'loc-g1', { status: 'in_studio' }), // 不进
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.artist.totalOutflowCount).toBe(3);
  });
});

// ─── M6: layoutConstellation ───────────────────────────────────────────────

describe('layoutConstellation', () => {
  it('center 落在 viewport 正中', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 800, height: 560 });
    expect(layout.center.x).toBe(400);
    expect(layout.center.y).toBe(280);
  });

  it('三环半径按 minDim × ratio 计算（默认 0.25 / 0.37 / 0.47）', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 800, height: 560 });
    const minDim = 560;
    expect(layout.radii.inner).toBeCloseTo(minDim * 0.25, 2);
    expect(layout.radii.middle).toBeCloseTo(minDim * 0.37, 2);
    expect(layout.radii.outer).toBeCloseTo(minDim * 0.47, 2);
  });

  it('location 节点落在对应 type 弧度区间内', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold' }),
      makeEdition('e2', 'loc-m1', { status: 'sold' }),
    ];
    const locations = [
      makeLocation('loc-g1', 'Gallery A', 'gallery'),
      makeLocation('loc-m1', 'Museum B', 'museum'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 560 });
    const galleryPoint = layout.locationPoints.find(
      (p) => p.node.id === 'loc-g1'
    )!;
    const museumPoint = layout.locationPoints.find(
      (p) => p.node.id === 'loc-m1'
    )!;
    const galleryArc = TYPE_ARC_RANGES.gallery;
    const museumArc = TYPE_ARC_RANGES.museum;
    expect(galleryPoint.angle).toBeGreaterThanOrEqual(galleryArc.start);
    expect(galleryPoint.angle).toBeLessThanOrEqual(galleryArc.end);
    expect(museumPoint.angle).toBeGreaterThanOrEqual(museumArc.start);
    expect(museumPoint.angle).toBeLessThanOrEqual(museumArc.end);
  });

  it('namedPoints 在 middle ring 上均匀分布', () => {
    const editions = Array.from({ length: 4 }, (_, i) =>
      makeEdition(`e${i}`, null, {
        status: 'sold',
        buyer_name: `Buyer ${i}`,
      })
    );
    const c = buildConstellation(editions, []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.namedPoints).toHaveLength(4);
    // 每个 named point 到中心距离 = middle radius
    for (const p of layout.namedPoints) {
      const d = Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2);
      expect(d).toBeCloseTo(layout.radii.middle, 2);
    }
  });

  it('anonymousPoints 在 outer ring 上均匀分布，count = anonymous.count', () => {
    const editions = Array.from({ length: 5 }, (_, i) =>
      makeEdition(`e${i}`, null, { status: 'sold' })
    );
    const c = buildConstellation(editions, []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.anonymousPoints).toHaveLength(5);
    for (const p of layout.anonymousPoints) {
      const d = Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2);
      expect(d).toBeCloseTo(layout.radii.outer, 2);
    }
  });
});

// ─── M6: namedNodeRadius ───────────────────────────────────────────────────

describe('namedNodeRadius', () => {
  it('最小值 4', () => {
    expect(namedNodeRadius(0)).toBe(4);
  });

  it('最大值 10', () => {
    expect(namedNodeRadius(9999)).toBe(10);
  });

  it('随 editionCount 增大而增大', () => {
    expect(namedNodeRadius(1)).toBeLessThan(namedNodeRadius(5));
    expect(namedNodeRadius(5)).toBeLessThanOrEqual(namedNodeRadius(10));
  });
});
