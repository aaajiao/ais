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
  getNodeVisual,
  generateOrganicPath,
  namedNodeRadius,
  TIME_SPIRAL_GEOMETRY,
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

// ─── M6 buildConstellation: firstSaleDate 聚合（v1.6 新增）──────────────────

describe('buildConstellation firstSaleDate', () => {
  it('location.firstSaleDate = 该 entity 所有 outflow editions sale_date 非空最小值', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold', sale_date: '2020-05-12' }),
      makeEdition('e2', 'loc-g1', { status: 'sold', sale_date: '2018-11-30' }),
      makeEdition('e3', 'loc-g1', { status: 'gifted', sale_date: '2024-01-01' }),
      // sale_date 缺失，不参与 min
      makeEdition('e4', 'loc-g1', { status: 'sold', sale_date: null }),
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.locations[0].firstSaleDate).toBe('2018-11-30');
  });

  it('全部 outflow editions 缺 sale_date → firstSaleDate = null（undated entity）', () => {
    const editions = [
      makeEdition('e1', 'loc-g1', { status: 'sold' }),
      makeEdition('e2', 'loc-g1', { status: 'gifted' }),
    ];
    const locations = [makeLocation('loc-g1', 'Gallery A', 'gallery')];
    const c = buildConstellation(editions, locations);
    expect(c.locations[0].firstSaleDate).toBeNull();
  });

  it('named buyer 同样有 firstSaleDate 聚合', () => {
    const editions = [
      makeEdition('e1', null, {
        status: 'sold',
        buyer_name: 'Liliana Gao',
        sale_date: '2022-08-15',
      }),
      makeEdition('e2', null, {
        status: 'sold',
        buyer_name: 'Liliana Gao',
        sale_date: '2019-04-01',
      }),
    ];
    const c = buildConstellation(editions, []);
    expect(c.namedPrivateBuyers[0].firstSaleDate).toBe('2019-04-01');
  });
});

// ─── v1.6 layoutConstellation (time-spiral) ────────────────────────────────

describe('layoutConstellation (time-spiral)', () => {
  it('artist center 落在 viewport 正中 (800×600 → (400, 300))', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.center.x).toBe(400);
    expect(layout.center.y).toBe(300);
  });

  it('geometry 暴露 TIME_SPIRAL_GEOMETRY 常量（v1.6.x 内缩值：60 / 190 / 220）', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.geometry.rInner).toBe(60);
    expect(layout.geometry.rOuterData).toBe(190);
    expect(layout.geometry.rGhost).toBe(220);
    // ANONYMOUS_R 仍导出向后兼容，但 layout 不再使用
    expect(layout.geometry.rAnonymous).toBe(TIME_SPIRAL_GEOMETRY.ANONYMOUS_R);
  });

  it('dated entity 按时间映射径向：earliest → r=R_INNER + 12 点钟；latest → r=R_OUTER_DATA + angle 按 index 接近一圈', () => {
    // 两个有时间的 location：early 2018-01-01 / late 2024-12-31
    const editions = [
      makeEdition('e1', 'loc-early', { status: 'sold', sale_date: '2018-01-01' }),
      makeEdition('e2', 'loc-late', { status: 'sold', sale_date: '2024-12-31' }),
    ];
    const locations = [
      makeLocation('loc-early', 'Early Gallery', 'gallery'),
      makeLocation('loc-late', 'Late Museum', 'museum'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 600 });

    const early = layout.locationPoints.find((p) => p.node.id === 'loc-early')!;
    const late = layout.locationPoints.find((p) => p.node.id === 'loc-late')!;

    // earliest → r ≈ R_INNER (60), angle = -π/2（12 点钟方向，i=0/N=2 → 0% of 2π）
    expect(early.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_INNER, 4);
    expect(early.angle).toBeCloseTo(-Math.PI / 2, 4);
    // earliest → (cx, cy - R_INNER) = (400, 300 - 60) = (400, 240)
    expect(early.x).toBeCloseTo(400, 4);
    expect(early.y).toBeCloseTo(240, 4);

    // latest → r ≈ R_OUTER_DATA (190), angle = -π/2 + (1/2) · 2π = π/2（6 点钟方向）
    // v1.6.x bug 修复：angle 改由 sorted-index 均匀分配，不再绕完整 360° 落回 12 点钟
    expect(late.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_OUTER_DATA, 4);
    expect(late.angle).toBeCloseTo(Math.PI / 2, 4);
    // 6 点钟方向 → cos=0, sin=1 → (400, 300 + 190) = (400, 490)
    expect(late.x).toBeCloseTo(400, 4);
    expect(late.y).toBeCloseTo(300 + 190, 4);

    expect(early.isUndated).toBe(false);
    expect(late.isUndated).toBe(false);
  });

  it('dated 只有 1 个 entity → 放在径向中点 + 12 点钟方向', () => {
    const editions = [
      makeEdition('e1', 'loc-only', { status: 'sold', sale_date: '2020-06-15' }),
    ];
    const locations = [makeLocation('loc-only', 'Only Gallery', 'gallery')];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    const p = layout.locationPoints[0];
    const midR =
      TIME_SPIRAL_GEOMETRY.R_INNER +
      (TIME_SPIRAL_GEOMETRY.R_OUTER_DATA - TIME_SPIRAL_GEOMETRY.R_INNER) / 2;
    expect(p.r).toBeCloseTo(midR, 4);
    expect(p.angle).toBeCloseTo(-Math.PI / 2, 4);
    expect(p.x).toBeCloseTo(400, 4);
    expect(p.y).toBeCloseTo(300 - midR, 4);
  });

  it('所有 dated entity firstSaleDate 完全相同 → span=0 fallback 到径向中点', () => {
    const editions = [
      makeEdition('e1', 'loc-a', { status: 'sold', sale_date: '2021-03-01' }),
      makeEdition('e2', 'loc-b', { status: 'sold', sale_date: '2021-03-01' }),
    ];
    const locations = [
      makeLocation('loc-a', 'A', 'gallery'),
      makeLocation('loc-b', 'B', 'museum'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    const midR =
      TIME_SPIRAL_GEOMETRY.R_INNER +
      (TIME_SPIRAL_GEOMETRY.R_OUTER_DATA - TIME_SPIRAL_GEOMETRY.R_INNER) / 2;
    for (const p of layout.locationPoints) {
      expect(p.r).toBeCloseTo(midR, 4);
      expect(p.angle).toBeCloseTo(-Math.PI / 2, 4);
    }
  });

  it('undated entity 全部 r = R_GHOST，从 12 点钟均匀分布 360°', () => {
    // 3 个 location 全部缺 sale_date
    const editions = [
      makeEdition('e1', 'loc-1', { status: 'sold' }),
      makeEdition('e2', 'loc-2', { status: 'sold' }),
      makeEdition('e3', 'loc-3', { status: 'sold' }),
    ];
    const locations = [
      makeLocation('loc-1', 'A', 'gallery'),
      makeLocation('loc-2', 'B', 'museum'),
      makeLocation('loc-3', 'C', 'private_collection'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.locationPoints).toHaveLength(3);
    for (const p of layout.locationPoints) {
      expect(p.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_GHOST, 4);
      expect(p.isUndated).toBe(true);
      const d = Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2);
      expect(d).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_GHOST, 2);
    }
    // 第一个 undated entity 落在 12 点钟方向
    const first = layout.locationPoints[0];
    expect(first.angle).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('dated locations + namedPrivate 在 time-spiral 上混排（不按 type 分弧）', () => {
    const editions = [
      makeEdition('e1', 'loc-m1', {
        status: 'sold',
        sale_date: '2018-01-01',
      }),
      makeEdition('e2', null, {
        status: 'sold',
        sale_date: '2020-01-01',
        buyer_name: 'Mr B',
      }),
      makeEdition('e3', 'loc-g1', {
        status: 'sold',
        sale_date: '2024-01-01',
      }),
    ];
    const locations = [
      makeLocation('loc-m1', 'Museum', 'museum'),
      makeLocation('loc-g1', 'Gallery', 'gallery'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.locationPoints).toHaveLength(2);
    expect(layout.namedPoints).toHaveLength(1);
    // earliest (loc-m1) r ≈ R_INNER；latest (loc-g1) r ≈ R_OUTER_DATA
    const earliest = layout.locationPoints.find((p) => p.node.id === 'loc-m1')!;
    const latest = layout.locationPoints.find((p) => p.node.id === 'loc-g1')!;
    const named = layout.namedPoints[0];
    expect(earliest.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_INNER, 4);
    expect(latest.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_OUTER_DATA, 4);
    // 2020-01-01 在 2018→2024 span 中点附近，r 介于 inner / outer-data 之间
    expect(named.r).toBeGreaterThan(TIME_SPIRAL_GEOMETRY.R_INNER);
    expect(named.r).toBeLessThan(TIME_SPIRAL_GEOMETRY.R_OUTER_DATA);
  });

  // ─── v1.6.x: anonymous 走 time-spiral ─────────────────────────────────────

  it('anonymous items 含 sale_date 与 artworkId（buildConstellation 同步填充）', () => {
    const editions = [
      makeEdition('e1', null, {
        artwork_id: 'art-x',
        status: 'sold',
        sale_date: '2022-05-12',
      }),
      makeEdition('e2', null, {
        artwork_id: 'art-y',
        status: 'gifted',
        sale_date: null,
      }),
    ];
    const c = buildConstellation(editions, []);
    expect(c.anonymous.items).toHaveLength(2);
    expect(c.anonymous.items[0]).toEqual({
      editionId: 'e1',
      artworkId: 'art-x',
      sale_date: '2022-05-12',
    });
    expect(c.anonymous.items[1]).toEqual({
      editionId: 'e2',
      artworkId: 'art-y',
      sale_date: null,
    });
  });

  it('dated anonymous items 按时间螺旋落点：r ∈ [R_INNER, R_OUTER_DATA]，每个点独立 editionId', () => {
    const editions = [
      makeEdition('e1', null, { status: 'sold', sale_date: '2019-01-01' }),
      makeEdition('e2', null, { status: 'sold', sale_date: '2022-06-15' }),
      makeEdition('e3', null, { status: 'sold', sale_date: '2024-12-31' }),
    ];
    const c = buildConstellation(editions, []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.anonymousPoints).toHaveLength(3);
    // 三条都按时间螺旋落点
    for (const p of layout.anonymousPoints) {
      expect(p.r).toBeGreaterThanOrEqual(TIME_SPIRAL_GEOMETRY.R_INNER);
      expect(p.r).toBeLessThanOrEqual(TIME_SPIRAL_GEOMETRY.R_OUTER_DATA);
      expect(p.isUndated).toBe(false);
    }
    // editionId 一一对应
    const ids = layout.anonymousPoints.map((p) => p.editionId).sort();
    expect(ids).toEqual(['e1', 'e2', 'e3']);
  });

  it('undated anonymous items 推到 R_GHOST 外圈', () => {
    const editions = [
      makeEdition('e1', null, { status: 'sold', sale_date: null }),
      makeEdition('e2', null, { status: 'gifted', sale_date: null }),
    ];
    const c = buildConstellation(editions, []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.anonymousPoints).toHaveLength(2);
    for (const p of layout.anonymousPoints) {
      expect(p.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_GHOST, 4);
      expect(p.isUndated).toBe(true);
    }
  });

  it('earliest/latest 时间范围计算包含 anonymous items.sale_date', () => {
    // location 一个 2020；anonymous 一个 2015 一个 2025
    // → earliest 应来自 anonymous (2015)，latest 也来自 anonymous (2025)
    // → location 落在中段 r 而非 R_INNER
    const editions = [
      makeEdition('e-loc', 'loc-mid', {
        status: 'sold',
        sale_date: '2020-01-01',
      }),
      makeEdition('e-anon-early', null, {
        status: 'sold',
        sale_date: '2015-01-01',
      }),
      makeEdition('e-anon-late', null, {
        status: 'sold',
        sale_date: '2025-01-01',
      }),
    ];
    const c = buildConstellation(editions, [
      makeLocation('loc-mid', 'Mid Gallery', 'gallery'),
    ]);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    const locP = layout.locationPoints[0];
    // 2020 在 2015→2025 中点 → t≈0.5 → r 在 R_INNER/R_OUTER_DATA 中段
    const midR =
      TIME_SPIRAL_GEOMETRY.R_INNER +
      (TIME_SPIRAL_GEOMETRY.R_OUTER_DATA - TIME_SPIRAL_GEOMETRY.R_INNER) / 2;
    expect(locP.r).toBeCloseTo(midR, 0);
  });

  it('混合数据下 anonymous 的 t=0 落 R_INNER，不再落 R=310', () => {
    // 一个 anonymous early + 一个 location late
    // → earliest anonymous 应在 R_INNER（不在旧 ANONYMOUS_R=310）
    const editions = [
      makeEdition('e-anon', null, { status: 'sold', sale_date: '2018-01-01' }),
      makeEdition('e-loc', 'loc-late', { status: 'sold', sale_date: '2024-01-01' }),
    ];
    const c = buildConstellation(editions, [
      makeLocation('loc-late', 'Late', 'gallery'),
    ]);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    expect(layout.anonymousPoints).toHaveLength(1);
    const anonP = layout.anonymousPoints[0];
    expect(anonP.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_INNER, 4);
    // 绝对不能是旧的 R=310 ring 位置
    expect(anonP.r).not.toBeCloseTo(TIME_SPIRAL_GEOMETRY.ANONYMOUS_R, 0);
  });

  // ─── v1.6.x bug 修复：时间密集区无重叠 ────────────────────────────────────

  it('sorted-by-time 后 angle 在时间密集区也分散（每个 entity 落点互异）', () => {
    // 5 个 entity 集中在 2 个月内成交（时间密集区，旧算法 r/angle 都同步插值）
    // 修复后：r 仍因时间接近而相似，但 angle 按 sorted index 均匀 → 不重叠
    const editions = [
      makeEdition('e1', null, { status: 'sold', sale_date: '2024-01-01', buyer_name: 'A' }),
      makeEdition('e2', null, { status: 'sold', sale_date: '2024-01-10', buyer_name: 'B' }),
      makeEdition('e3', null, { status: 'sold', sale_date: '2024-01-20', buyer_name: 'C' }),
      makeEdition('e4', null, { status: 'sold', sale_date: '2024-02-01', buyer_name: 'D' }),
      makeEdition('e5', null, { status: 'sold', sale_date: '2024-02-15', buyer_name: 'E' }),
    ];
    const c = buildConstellation(editions, []);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    // 5 个 named buyer 全是 dated → 都在 namedPoints
    expect(layout.namedPoints).toHaveLength(5);
    // 所有 angle 互异（无 entity 落同一点）
    const angles = layout.namedPoints.map((p) => p.angle);
    const uniq = new Set(angles);
    expect(uniq.size).toBe(5);
    // 所有 (x, y) 互异 —— 真正的反重叠断言
    const coords = layout.namedPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    const coordsUniq = new Set(coords);
    expect(coordsUniq.size).toBe(5);
  });

  it('latest dated entity 落在 angle ≈ -π/2 + (N-1)/N · 2π（不再绕完整一圈）', () => {
    // 3 个 dated entity → latest angle = -π/2 + 2/3·2π
    const editions = [
      makeEdition('e1', 'loc-a', { status: 'sold', sale_date: '2018-01-01' }),
      makeEdition('e2', 'loc-b', { status: 'sold', sale_date: '2020-01-01' }),
      makeEdition('e3', 'loc-c', { status: 'sold', sale_date: '2024-01-01' }),
    ];
    const c = buildConstellation(editions, [
      makeLocation('loc-a', 'A', 'gallery'),
      makeLocation('loc-b', 'B', 'gallery'),
      makeLocation('loc-c', 'C', 'gallery'),
    ]);
    const layout = layoutConstellation(c, { width: 800, height: 600 });
    const latest = layout.locationPoints.find((p) => p.node.id === 'loc-c')!;
    const expectedAngle = -Math.PI / 2 + (2 / 3) * 2 * Math.PI;
    expect(latest.angle).toBeCloseTo(expectedAngle, 4);
  });
});

// ─── v1.6 getNodeVisual ────────────────────────────────────────────────────

describe('getNodeVisual', () => {
  it('museum > private_collection > gallery > named_private (相同 editionCount=1 base r 对比)', () => {
    const m = getNodeVisual('location', 'museum', 1).r;
    const p = getNodeVisual('location', 'private_collection', 1).r;
    const g = getNodeVisual('location', 'gallery', 1).r;
    const n = getNodeVisual('named_private', null, 1).r;
    // museum 14 / private_collection 12 / gallery 12 / named_private 7
    expect(m).toBeGreaterThan(p);
    expect(p).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThan(n);
  });

  it('同 type 内 editionCount 增大 → r 单调不降', () => {
    expect(getNodeVisual('location', 'museum', 1).r).toBeLessThan(
      getNodeVisual('location', 'museum', 10).r
    );
    expect(getNodeVisual('named_private', null, 1).r).toBeLessThan(
      getNodeVisual('named_private', null, 20).r
    );
  });

  it('private_collection 返回 innerRingR 非 null；其他 type innerRingR = null', () => {
    expect(getNodeVisual('location', 'private_collection', 1).innerRingR).not.toBeNull();
    expect(getNodeVisual('location', 'museum', 1).innerRingR).toBeNull();
    expect(getNodeVisual('location', 'gallery', 1).innerRingR).toBeNull();
    expect(getNodeVisual('location', 'studio', 1).innerRingR).toBeNull();
    expect(getNodeVisual('location', 'other', 1).innerRingR).toBeNull();
    expect(getNodeVisual('named_private', null, 1).innerRingR).toBeNull();
  });

  it('anonymous 固定 r=1.5，style=dust', () => {
    const a = getNodeVisual('anonymous', null, 1);
    expect(a.r).toBe(1.5);
    expect(a.style).toBe('dust');
    const a2 = getNodeVisual('anonymous', null, 100);
    expect(a2.r).toBe(1.5); // anonymous 不随 editionCount 变化
  });

  it('未知 type fallback 不报错', () => {
    // type=null（理论 location 应有 type，但万一）走 fallback
    const v = getNodeVisual('location', null, 1);
    expect(v.r).toBeGreaterThan(0);
    expect(v.style).toBe('solid');
  });

  it('opacity spec：museum=1.0 / private_collection=0.85 / gallery=0.7 / named=0.55 / anonymous=0.3', () => {
    expect(getNodeVisual('location', 'museum', 1).opacity).toBe(1.0);
    expect(getNodeVisual('location', 'private_collection', 1).opacity).toBe(0.85);
    expect(getNodeVisual('location', 'gallery', 1).opacity).toBe(0.7);
    expect(getNodeVisual('named_private', null, 1).opacity).toBe(0.55);
    expect(getNodeVisual('anonymous', null, 1).opacity).toBe(0.3);
  });
});

// ─── v1.6.x: generateOrganicPath ─────────────────────────────────────────

describe('generateOrganicPath', () => {
  it('deterministic：同 seed + 同 cx/cy/baseR → 同 path', () => {
    const a = generateOrganicPath(100, 100, 20, 'museum-shanghai');
    const b = generateOrganicPath(100, 100, 20, 'museum-shanghai');
    expect(a).toBe(b);
  });

  it('不同 seed → 不同 path（hash 真的散开了）', () => {
    const a = generateOrganicPath(100, 100, 20, 'seed-A');
    const b = generateOrganicPath(100, 100, 20, 'seed-B');
    expect(a).not.toBe(b);
  });

  it('path format: 以 M 开头、Z 结尾、12 段 Q', () => {
    const path = generateOrganicPath(100, 100, 20, 'x');
    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith(' Z')).toBe(true);
    const qCount = (path.match(/\sQ\s/g) ?? []).length;
    expect(qCount).toBe(12);
  });

  it('bounding box 大致 baseR ± 15%（路径所有点到中心距离 ≤ baseR × 1.15 + 浮点容差）', () => {
    const cx = 200;
    const cy = 150;
    const baseR = 18;
    const path = generateOrganicPath(cx, cy, baseR, 'akeroyd-collection');
    // 解析所有 number（M cx cy / Q x y x y）
    const nums = path
      .replace(/[MQZ,]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    // 配对成 (x, y) 坐标
    expect(nums.length % 2).toBe(0);
    const allowedMaxDist = baseR * 1.15 + 1; // +1 浮点容差
    for (let i = 0; i < nums.length; i += 2) {
      const dx = nums[i] - cx;
      const dy = nums[i + 1] - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      expect(d).toBeLessThanOrEqual(allowedMaxDist);
    }
  });
});

// ─── 兼容性：legacy namedNodeRadius（@deprecated）保留导出守护测试 ─────────

describe('namedNodeRadius (legacy)', () => {
  it('保留导出 + 单调递增（@deprecated 不被新 view 使用）', () => {
    expect(namedNodeRadius(0)).toBe(4);
    expect(namedNodeRadius(9999)).toBe(10);
    expect(namedNodeRadius(1)).toBeLessThan(namedNodeRadius(5));
  });
});
