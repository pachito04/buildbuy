/**
 * pool-cross-utils.ts
 *
 * Pure crossing logic for the interempresa pool flow (#9b).
 * Consolidates items from multiple companies into canonical material lines
 * using USABLE material mappings (both companies confirmed) only.
 *
 * No side-effects, no I/O — fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PoolEligibleItem {
  company_id: string;
  material_id: string;
  description: string;
  unit: string;
  quantity: number;
}

export interface Mapping {
  material_a_id: string;
  material_b_id: string;
  /** true only when both companies have confirmed (dual-confirmed, AD-2) */
  usable: boolean;
}

export interface PoolConsolidatedLine {
  canonicalMaterialId: string;
  description: string;
  unit: string;
  totalQuantity: number;
  contributions: Array<{ company_id: string; quantity: number }>;
}

// ---------------------------------------------------------------------------
// Union-Find (path-compressed, union-by-rank)
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  private ensure(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(id: string): string {
    this.ensure(id);
    let root = id;
    // Find root
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;

    // Union by rank: smaller rank attaches under larger rank
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Consolidates pool-eligible items from multiple companies into canonical lines.
 *
 * Algorithm:
 *  1. Build a Union-Find over material IDs, unioning pairs connected by USABLE mappings.
 *  2. For each item, find the canonical representative of its material's component.
 *  3. Accumulate quantity per (canonical, company_id).
 *  4. Emit one PoolConsolidatedLine per canonical group.
 *
 * Canonical representative is stable: it is the Union-Find root after all unions,
 * which is always one of the actual material IDs in the group.
 */
export function crossPoolItems(
  items: PoolEligibleItem[],
  usableMappings: Mapping[]
): PoolConsolidatedLine[] {
  if (items.length === 0) return [];

  // 1. Build union-find from USABLE mappings only
  const uf = new UnionFind();

  // Ensure every material referenced by items is registered
  for (const item of items) {
    uf.find(item.material_id); // side-effect: registers if not present
  }

  for (const mapping of usableMappings) {
    if (!mapping.usable) continue;
    uf.union(mapping.material_a_id, mapping.material_b_id);
  }

  // 2. Accumulate quantity and description per (canonical, company_id)
  //    Also track description and unit per canonical group
  //    (use the first item encountered for each canonical group as the canonical metadata)
  const groupMeta: Map<string, { description: string; unit: string }> = new Map();
  // Map: canonical → company_id → quantity
  const contributions: Map<string, Map<string, number>> = new Map();

  for (const item of items) {
    const canonical = uf.find(item.material_id);

    if (!groupMeta.has(canonical)) {
      groupMeta.set(canonical, { description: item.description, unit: item.unit });
    }

    if (!contributions.has(canonical)) {
      contributions.set(canonical, new Map());
    }

    const companyMap = contributions.get(canonical)!;
    companyMap.set(item.company_id, (companyMap.get(item.company_id) ?? 0) + item.quantity);
  }

  // 3. Emit consolidated lines
  const result: PoolConsolidatedLine[] = [];

  for (const [canonical, companyMap] of contributions.entries()) {
    const meta = groupMeta.get(canonical)!;

    const contribArray: Array<{ company_id: string; quantity: number }> = [];
    let total = 0;

    for (const [company_id, quantity] of companyMap.entries()) {
      contribArray.push({ company_id, quantity });
      total += quantity;
    }

    result.push({
      canonicalMaterialId: canonical,
      description: meta.description,
      unit: meta.unit,
      totalQuantity: total,
      contributions: contribArray,
    });
  }

  return result;
}
