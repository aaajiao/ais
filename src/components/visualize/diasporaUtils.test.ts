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
  buildGhostEditions,
  layoutGhostRing,
  TIME_SPIRAL_GEOMETRY,
} from './diasporaUtils';
import type { LocationNode } from './diasporaUtils';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
  VizArtwork,
} from '@/hooks/queries/useVisualizationData';

/** v1.6.x 第二轮：phyllotaxis 黄金角（rad），与 diasporaUtils 同步 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
  it('artist center 落在 viewport 正中 (1200×680 → (600, 340)，v1.6.x 第四轮椭圆化 viewBox)', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
    expect(layout.center.x).toBe(600);
    expect(layout.center.y).toBe(340);
  });

  it('geometry 暴露 TIME_SPIRAL_GEOMETRY 常量（R 不变 80 / 260 / 300，第四轮加 ASPECT_X=1.55）', () => {
    const c = buildConstellation([], []);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
    expect(layout.geometry.rInner).toBe(80);
    expect(layout.geometry.rOuterData).toBe(260);
    expect(layout.geometry.rGhost).toBe(300);
    // ANONYMOUS_R 仍导出向后兼容，但 layout 不再使用
    expect(layout.geometry.rAnonymous).toBe(TIME_SPIRAL_GEOMETRY.ANONYMOUS_R);
    // v1.6.x 第四轮新增：ASPECT_X 椭圆化系数
    expect(TIME_SPIRAL_GEOMETRY.ASPECT_X).toBe(1.55);
  });

  it('dated entity 按时间映射径向：earliest → r=R_INNER + 12 点钟（phyllotaxis i=0 起点）；latest → r=R_OUTER_DATA + angle 按 i×GOLDEN_ANGLE 分配', () => {
    // 两个有时间的 location：early 2018-01-01 / late 2024-12-31
    // v1.6.x 第二轮：angle 改为 phyllotaxis 黄金角分布。N=2 时碰撞检测看两节点
    // 是否需要推开 —— 两点 r 一近一远（R_INNER=80 / R_OUTER_DATA=260），笛卡尔
    // 距离够大不触发推开，angle 应保持精确的 phyllotaxis 值。
    // v1.6.x 第三轮：viewBox 600→760，cy=380；R 60→80 → earliest y = 380-80 = 300
    const editions = [
      makeEdition('e1', 'loc-early', { status: 'sold', sale_date: '2018-01-01' }),
      makeEdition('e2', 'loc-late', { status: 'sold', sale_date: '2024-12-31' }),
    ];
    const locations = [
      makeLocation('loc-early', 'Early Gallery', 'gallery'),
      makeLocation('loc-late', 'Late Museum', 'museum'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });

    const early = layout.locationPoints.find((p) => p.node.id === 'loc-early')!;
    const late = layout.locationPoints.find((p) => p.node.id === 'loc-late')!;

    // earliest → r ≈ R_INNER (80), angle = -π/2（i=0 phyllotaxis 起点）
    // 12 点钟方向：cos(-π/2)=0 → x = cx = 600（ASPECT_X 在 cos=0 处不显影响）
    // sin(-π/2)=-1 → y = cy - R_INNER = 340 - 80 = 260
    expect(early.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_INNER, 4);
    expect(early.angle).toBeCloseTo(-Math.PI / 2, 4);
    expect(early.x).toBeCloseTo(600, 4);
    expect(early.y).toBeCloseTo(340 - TIME_SPIRAL_GEOMETRY.R_INNER, 4);

    // latest → r ≈ R_OUTER_DATA (260), angle = -π/2 + 1·GOLDEN_ANGLE
    // R_INNER=80 与 R_OUTER_DATA=260 距离已超过两节点视觉半径之和，碰撞推开不会触发
    expect(late.r).toBeCloseTo(TIME_SPIRAL_GEOMETRY.R_OUTER_DATA, 4);
    expect(late.angle).toBeCloseTo(-Math.PI / 2 + GOLDEN_ANGLE, 4);

    expect(early.isUndated).toBe(false);
    expect(late.isUndated).toBe(false);
  });

  it('dated 只有 1 个 entity → 放在径向中点 + 12 点钟方向', () => {
    const editions = [
      makeEdition('e1', 'loc-only', { status: 'sold', sale_date: '2020-06-15' }),
    ];
    const locations = [makeLocation('loc-only', 'Only Gallery', 'gallery')];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
    const p = layout.locationPoints[0];
    const midR =
      TIME_SPIRAL_GEOMETRY.R_INNER +
      (TIME_SPIRAL_GEOMETRY.R_OUTER_DATA - TIME_SPIRAL_GEOMETRY.R_INNER) / 2;
    expect(p.r).toBeCloseTo(midR, 4);
    expect(p.angle).toBeCloseTo(-Math.PI / 2, 4);
    // cx = 1200/2 = 600；12 点钟 → cos=0 → x = cx 不受 ASPECT_X 影响
    expect(p.x).toBeCloseTo(600, 4);
    // cy = 680/2 = 340, 12 点钟方向 → y = cy − midR
    expect(p.y).toBeCloseTo(340 - midR, 4);
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
    expect(layout.locationPoints).toHaveLength(3);
    // v1.6.x 第四轮：椭圆化后点不在圆上，在 ellipse 上：
    // ((x-cx)/(R·ASPECT_X))² + ((y-cy)/R)² = 1
    // cx=600, cy=340, R=R_GHOST=300, ASPECT_X=1.55
    const { R_GHOST, ASPECT_X } = TIME_SPIRAL_GEOMETRY;
    for (const p of layout.locationPoints) {
      expect(p.r).toBeCloseTo(R_GHOST, 4);
      expect(p.isUndated).toBe(true);
      const nx = (p.x - 600) / (R_GHOST * ASPECT_X);
      const ny = (p.y - 340) / R_GHOST;
      expect(nx * nx + ny * ny).toBeCloseTo(1, 2);
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
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

  it('phyllotaxis angle 起点：第 0 个 dated 在 -π/2（12 点钟），第 i 个 = -π/2 + i × GOLDEN_ANGLE', () => {
    // 3 个 dated entity 时间相距足够远 + r 也分散（R_INNER → R_OUTER_DATA）→
    // 碰撞推开不触发，angle 应精确等于 phyllotaxis 公式值。
    const editions = [
      makeEdition('e1', 'loc-a', { status: 'sold', sale_date: '2018-01-01' }),
      makeEdition('e2', 'loc-b', { status: 'sold', sale_date: '2021-01-01' }),
      makeEdition('e3', 'loc-c', { status: 'sold', sale_date: '2024-01-01' }),
    ];
    const c = buildConstellation(editions, [
      makeLocation('loc-a', 'A', 'gallery'),
      makeLocation('loc-b', 'B', 'gallery'),
      makeLocation('loc-c', 'C', 'gallery'),
    ]);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });
    const a = layout.locationPoints.find((p) => p.node.id === 'loc-a')!;
    const b = layout.locationPoints.find((p) => p.node.id === 'loc-b')!;
    const cP = layout.locationPoints.find((p) => p.node.id === 'loc-c')!;
    expect(a.angle).toBeCloseTo(-Math.PI / 2, 4);
    expect(b.angle).toBeCloseTo(-Math.PI / 2 + GOLDEN_ANGLE, 4);
    expect(cP.angle).toBeCloseTo(-Math.PI / 2 + 2 * GOLDEN_ANGLE, 4);
  });

  // ─── v1.6.x 第二轮：碰撞推开 ───────────────────────────────────────────────

  it('时间密集 5+ entity 全部 chord ≥ r_a + r_b − 1（碰撞推开保留 1px epsilon）', () => {
    // 7 个 entity 在 2 个月内成交 —— phyllotaxis 已让 angle 散，但 r 仍接近
    // (R_INNER 区域)。碰撞推开应把任何 chord < r_a + r_b + pad 的对推到 ≥
    // r_a + r_b - 1。所有 entity 都是同视觉档 (named_private r≈7) 避免边界
    // case。每对包括 anonymous(3.5) / named(7) / location(museum 14)。
    const editions = [
      // 4 个 named buyer
      makeEdition('e1', null, {
        status: 'sold',
        sale_date: '2024-01-01',
        buyer_name: 'A',
      }),
      makeEdition('e2', null, {
        status: 'sold',
        sale_date: '2024-01-08',
        buyer_name: 'B',
      }),
      makeEdition('e3', null, {
        status: 'sold',
        sale_date: '2024-01-15',
        buyer_name: 'C',
      }),
      makeEdition('e4', null, {
        status: 'sold',
        sale_date: '2024-01-22',
        buyer_name: 'D',
      }),
      // 1 个 anonymous
      makeEdition('e5', null, { status: 'sold', sale_date: '2024-01-29' }),
      // 2 个 location（museum + gallery）
      makeEdition('e6', 'loc-m', {
        status: 'sold',
        sale_date: '2024-02-05',
      }),
      makeEdition('e7', 'loc-g', {
        status: 'sold',
        sale_date: '2024-02-12',
      }),
    ];
    const locations = [
      makeLocation('loc-m', 'M', 'museum'),
      makeLocation('loc-g', 'G', 'gallery'),
    ];
    const c = buildConstellation(editions, locations);
    const layout = layoutConstellation(c, { width: 1200, height: 680 });

    // 收集所有 dated point + 视觉半径
    const all: Array<{ x: number; y: number; r: number; id: string }> = [];
    for (const p of layout.locationPoints) {
      all.push({
        x: p.x,
        y: p.y,
        r: getNodeVisual('location', p.node.type, p.node.editionCount).r,
        id: `loc:${p.node.id}`,
      });
    }
    for (const p of layout.namedPoints) {
      all.push({
        x: p.x,
        y: p.y,
        r: getNodeVisual('named_private', null, p.node.editionCount).r,
        id: `named:${p.node.id}`,
      });
    }
    for (const p of layout.anonymousPoints) {
      all.push({
        x: p.x,
        y: p.y,
        r: getNodeVisual('anonymous', null, 1).r,
        id: `anon:${p.editionId}`,
      });
    }
    // 任意两点 chord ≥ r_a + r_b − 1
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dx = all[j].x - all[i].x;
        const dy = all[j].y - all[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minAllowed = Math.max(0, all[i].r + all[j].r - 1);
        // 失败信息含两节点 id 方便定位
        expect(d, `${all[i].id} ↔ ${all[j].id} chord=${d.toFixed(2)} min=${minAllowed.toFixed(2)}`).toBeGreaterThanOrEqual(minAllowed);
      }
    }
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

  it('anonymous 固定 r=3.5，style=dust（v1.6.x 第二轮：1.5→3.5，"看得见但无名"档）', () => {
    const a = getNodeVisual('anonymous', null, 1);
    expect(a.r).toBe(3.5);
    expect(a.style).toBe('dust');
    const a2 = getNodeVisual('anonymous', null, 100);
    expect(a2.r).toBe(3.5); // anonymous 不随 editionCount 变化
  });

  it('未知 type fallback 不报错', () => {
    // type=null（理论 location 应有 type，但万一）走 fallback
    const v = getNodeVisual('location', null, 1);
    expect(v.r).toBeGreaterThan(0);
    expect(v.style).toBe('solid');
  });

  it('opacity spec：museum=1.0 / private_collection=0.85 / gallery=0.7 / named=0.55 / anonymous=0.55（v1.6.x 第二轮升）', () => {
    expect(getNodeVisual('location', 'museum', 1).opacity).toBe(1.0);
    expect(getNodeVisual('location', 'private_collection', 1).opacity).toBe(0.85);
    expect(getNodeVisual('location', 'gallery', 1).opacity).toBe(0.7);
    expect(getNodeVisual('named_private', null, 1).opacity).toBe(0.55);
    expect(getNodeVisual('anonymous', null, 1).opacity).toBe(0.55);
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

  it('path format: 以 M 开头、Z 结尾、6 段 C cubic bezier（v1.6.x 第七轮：6 段水滴形 Catmull-Rom）', () => {
    const path = generateOrganicPath(100, 100, 20, 'x');
    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith(' Z')).toBe(true);
    const cCount = (path.match(/\sC\s/g) ?? []).length;
    expect(cCount).toBe(6);
    // 第七轮：8 段 → 6 段 + FNV-1a hash + ±40% 扰动 = 流体水滴。
    // 仍是 Catmull-Rom smooth，不出现 Q 或 L
    expect(path).not.toMatch(/\sQ\s/);
    expect(path).not.toMatch(/\sL\s/);
  });

  it('bounding box 大致 baseR ± 40%（perturbed anchor points 到中心距离 ≤ baseR × 1.40 + 浮点容差）', () => {
    const cx = 200;
    const cy = 150;
    const baseR = 18;
    const path = generateOrganicPath(cx, cy, baseR, 'akeroyd-collection');
    // 解析 path 命令 + 数值（M cx cy / C c1x c1y c2x c2y endX endY）。
    // Catmull-Rom 控制点可能比 baseR × 1.40 略微 overshoot（smooth 弧线代价），
    // 只验证 anchor points（M 和每个 C 段的 end point = perturbed point）。
    const tokens = path.split(/\s+/).filter(Boolean);
    const anchorPoints: Array<{ x: number; y: number }> = [];
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i];
      if (cmd === 'M') {
        anchorPoints.push({ x: +tokens[i + 1], y: +tokens[i + 2] });
        i += 3;
      } else if (cmd === 'C') {
        anchorPoints.push({ x: +tokens[i + 5], y: +tokens[i + 6] });
        i += 7;
      } else {
        i += 1; // Z 等
      }
    }
    const allowedMaxDist = baseR * 1.4 + 1; // +1 浮点容差
    for (const p of anchorPoints) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      expect(d).toBeLessThanOrEqual(allowedMaxDist);
    }
  });

  it('FNV-1a hash spread：5 个 type seed 形状 max/min ratio 应 > 1.5（远超旧 polynomial hash 的 1.03）', () => {
    // 第七轮加测：FNV-1a hash spread 显著 → 5 个 type chip 形状真正不同。
    // 旧 `h*31+char` 在短 seed 上输出集中，max/min ratio 实测 1.03（似圆）。
    // FNV-1a 应让大多 seed ratio > 1.5（视觉差异明显）。
    const seeds = ['studio', 'gallery', 'museum', 'private_collection', 'other'];
    const ratios = seeds.map((seed) => {
      const path = generateOrganicPath(10, 10, 8, seed);
      const tokens = path.split(/\s+/).filter(Boolean);
      const dists: number[] = [];
      let i = 0;
      while (i < tokens.length) {
        if (tokens[i] === 'M') {
          dists.push(Math.hypot(+tokens[i + 1] - 10, +tokens[i + 2] - 10));
          i += 3;
        } else if (tokens[i] === 'C') {
          dists.push(Math.hypot(+tokens[i + 5] - 10, +tokens[i + 6] - 10));
          i += 7;
        } else {
          i += 1;
        }
      }
      return Math.max(...dists) / Math.min(...dists);
    });
    // 大多 seed (>= 3/5) 应有显著差异 ratio > 1.5
    const significant = ratios.filter((r) => r > 1.5).length;
    expect(significant).toBeGreaterThanOrEqual(3);
  });
});

// ─── v1.6.x 第二轮: buildGhostEditions / layoutGhostRing ──────────────────

describe('buildGhostEditions', () => {
  function makeArtwork(id: string, title_en = '', title_cn = ''): VizArtwork {
    return {
      id,
      title_en,
      title_cn,
      year: '2024',
      type: 'Installation',
      thumbnail_url: null,
      edition_total: 1,
      ap_total: 0,
      is_unique: false,
      created_at: '2024-01-01T00:00:00Z',
    };
  }

  it('过滤：只保留 location_id == null && status ∉ (sold, gifted)', () => {
    const editions = [
      makeEdition('e1', null, { status: 'in_studio' }),
      makeEdition('e2', 'loc-1', { status: 'in_studio' }), // 有 location，排除
      makeEdition('e3', null, { status: 'sold' }), // outflow，排除
      makeEdition('e4', null, { status: 'gifted' }), // outflow，排除
      makeEdition('e5', null, { status: 'in_production' }),
    ];
    const artworks = [makeArtwork('artwork-1', 'My Title', '')];
    const ghosts = buildGhostEditions(editions, artworks);
    expect(ghosts).toHaveLength(2);
    expect(ghosts.map((g) => g.editionId).sort()).toEqual(['e1', 'e5']);
  });

  it('artwork 不存在时 title = null（缺失态不藏，edition 仍出现）', () => {
    const editions = [
      makeEdition('e1', null, { status: 'in_studio', artwork_id: 'art-missing' }),
    ];
    const ghosts = buildGhostEditions(editions, []);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].title).toBeNull();
    expect(ghosts[0].editionId).toBe('e1');
  });

  it('artwork.title_en 优先，缺时回退 title_cn，空字符串 → null', () => {
    const editions = [
      makeEdition('e1', null, { status: 'in_studio', artwork_id: 'a-en' }),
      makeEdition('e2', null, { status: 'in_studio', artwork_id: 'a-cn' }),
      makeEdition('e3', null, { status: 'in_studio', artwork_id: 'a-empty' }),
    ];
    const artworks = [
      makeArtwork('a-en', 'English Title', '中文标题'),
      makeArtwork('a-cn', '', '只有中文'),
      makeArtwork('a-empty', '', ''),
    ];
    const ghosts = buildGhostEditions(editions, artworks);
    const byId = new Map(ghosts.map((g) => [g.editionId, g]));
    expect(byId.get('e1')?.title).toBe('English Title');
    expect(byId.get('e2')?.title).toBe('只有中文');
    expect(byId.get('e3')?.title).toBeNull();
  });

  it('排序：status 优先级（in_production → in_studio → in_transit → at_gallery → at_museum → 其他），组内 created_at desc', () => {
    const editions = [
      makeEdition('e-gal', null, {
        status: 'at_gallery',
        created_at: '2024-01-01T00:00:00Z',
      }),
      makeEdition('e-stu-old', null, {
        status: 'in_studio',
        created_at: '2024-01-01T00:00:00Z',
      }),
      makeEdition('e-stu-new', null, {
        status: 'in_studio',
        created_at: '2025-06-01T00:00:00Z',
      }),
      makeEdition('e-prod', null, {
        status: 'in_production',
        created_at: '2024-05-01T00:00:00Z',
      }),
      makeEdition('e-mus', null, {
        status: 'at_museum',
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];
    const ghosts = buildGhostEditions(editions, []);
    expect(ghosts.map((g) => g.editionId)).toEqual([
      'e-prod', // in_production (优先级 0)
      'e-stu-new', // in_studio 组内 desc → new 先
      'e-stu-old', // in_studio 组内 desc → old 后
      'e-gal', // at_gallery (优先级 3)
      'e-mus', // at_museum (优先级 4)
    ]);
  });

  it('inventoryNumber + status 字面值透传，不归一化', () => {
    const editions = [
      makeEdition('e1', null, {
        status: 'in_studio',
        inventory_number: 'AAJ-2024-001',
      }),
      makeEdition('e2', null, {
        status: 'in_production',
        inventory_number: null,
      }),
    ];
    const ghosts = buildGhostEditions(editions, []);
    const byId = new Map(ghosts.map((g) => [g.editionId, g]));
    expect(byId.get('e1')?.inventoryNumber).toBe('AAJ-2024-001');
    expect(byId.get('e1')?.status).toBe('in_studio');
    expect(byId.get('e2')?.inventoryNumber).toBeNull();
    expect(byId.get('e2')?.status).toBe('in_production');
  });

  it('空 editions → 空数组', () => {
    expect(buildGhostEditions([], [])).toEqual([]);
  });

  it('全是 outflow 或全有 location → 空数组（buildGhostEditions 不出 noise）', () => {
    const editions = [
      makeEdition('e1', 'loc-1', { status: 'in_studio' }),
      makeEdition('e2', null, { status: 'sold' }),
      makeEdition('e3', null, { status: 'gifted' }),
    ];
    expect(buildGhostEditions(editions, [])).toEqual([]);
  });
});

describe('layoutGhostRing', () => {
  function makeGhost(editionId: string, status = 'in_studio') {
    return {
      editionId,
      artworkId: 'art-1',
      title: null,
      inventoryNumber: null,
      status,
    };
  }

  it('N=0 → 空数组（view 据此不渲染）', () => {
    expect(layoutGhostRing([], { width: 1200, height: 680 })).toEqual([]);
  });

  it('默认 radius=340，center 取 (width/2, height/2)（v1.6.x 第四轮 viewBox 1200×680 → center (600, 340)）', () => {
    const ghosts = [makeGhost('e1')];
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680 });
    expect(pts).toHaveLength(1);
    // 第一点 angle = -π/2 → cos=0，ASPECT_X 不影响 x；落 (600, 340 - 340) = (600, 0)
    expect(pts[0].angle).toBeCloseTo(-Math.PI / 2, 4);
    expect(pts[0].x).toBeCloseTo(600, 4);
    expect(pts[0].y).toBeCloseTo(0, 4);
  });

  it('N>0 第一点 angle = -π/2（12 点钟起点）', () => {
    const ghosts = [makeGhost('e1'), makeGhost('e2'), makeGhost('e3')];
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680 });
    expect(pts[0].angle).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('N 个点均匀分布 360°（相邻 angle 差 = 2π/N）', () => {
    const N = 5;
    const ghosts = Array.from({ length: N }, (_, i) => makeGhost(`e${i}`));
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680 });
    expect(pts).toHaveLength(N);
    const expectedStep = (2 * Math.PI) / N;
    for (let i = 1; i < N; i++) {
      expect(pts[i].angle - pts[i - 1].angle).toBeCloseTo(expectedStep, 4);
    }
  });

  it('每个点落在 ellipse 上：((x-cx)/(r·ASPECT_X))² + ((y-cy)/r)² = 1（v1.6.x 第四轮椭圆化）', () => {
    const ghosts = [makeGhost('e1'), makeGhost('e2'), makeGhost('e3'), makeGhost('e4')];
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680 });
    const radius = 340;
    const { ASPECT_X } = TIME_SPIRAL_GEOMETRY;
    for (const p of pts) {
      // cx=600, cy=340；ellipse 不变量
      const nx = (p.x - 600) / (radius * ASPECT_X);
      const ny = (p.y - 340) / radius;
      expect(nx * nx + ny * ny).toBeCloseTo(1, 4);
    }
  });

  it('自定义 radius option 生效', () => {
    const ghosts = [makeGhost('e1')];
    // cy = 680/2 = 340，自定义 radius = 340 让 12 点钟方向落到 y=0
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680, radius: 340 });
    expect(pts[0].y).toBeCloseTo(0, 4); // 12 点钟方向 cy - radius = 340 - 340 = 0
  });

  it('每个 GhostRingPoint 带 ghost meta（用于 view 渲染 + click 跳转）', () => {
    const ghosts = [makeGhost('e1', 'in_production')];
    const pts = layoutGhostRing(ghosts, { width: 1200, height: 680 });
    expect(pts[0].ghost.editionId).toBe('e1');
    expect(pts[0].ghost.status).toBe('in_production');
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
