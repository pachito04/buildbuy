import { describe, it, expect } from 'vitest';
import {
  groupMatchRows,
  type RawMatchRow,
  type ConsolidationMatch,
} from '../consolidacion-match-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<RawMatchRow> = {}): RawMatchRow {
  return {
    id: 'item-1',
    request_id: 'req-2',
    material_id: 'mat-1',
    description: 'Cemento',
    requests: {
      id: 'req-2',
      request_number: 2,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupMatchRows
// ---------------------------------------------------------------------------

describe('groupMatchRows', () => {
  it('returns empty array when given no rows', () => {
    expect(groupMatchRows([], 'req-1')).toEqual([]);
  });

  it('excludes rows belonging to the current request', () => {
    const rows: RawMatchRow[] = [
      makeRow({ request_id: 'req-1', requests: { id: 'req-1', request_number: 1 } }),
    ];
    expect(groupMatchRows(rows, 'req-1')).toEqual([]);
  });

  it('returns a match for a single row from another request', () => {
    const rows: RawMatchRow[] = [
      makeRow({
        id: 'item-2',
        request_id: 'req-2',
        material_id: 'mat-1',
        description: 'Cemento',
        requests: { id: 'req-2', request_number: 2 },
      }),
    ];

    const result = groupMatchRows(rows, 'req-1');

    expect(result).toHaveLength(1);
    expect(result[0].material_id).toBe('mat-1');
    expect(result[0].description).toBe('Cemento');
    expect(result[0].otherRequests).toHaveLength(1);
    expect(result[0].otherRequests[0]).toEqual({ request_id: 'req-2', request_number: 2 });
  });

  it('groups multiple rows for the same material into one match', () => {
    const rows: RawMatchRow[] = [
      makeRow({ id: 'item-2', request_id: 'req-2', material_id: 'mat-1', requests: { id: 'req-2', request_number: 2 } }),
      makeRow({ id: 'item-3', request_id: 'req-3', material_id: 'mat-1', description: 'Cemento', requests: { id: 'req-3', request_number: 3 } }),
    ];

    const result = groupMatchRows(rows, 'req-1');

    expect(result).toHaveLength(1);
    expect(result[0].material_id).toBe('mat-1');
    expect(result[0].otherRequests).toHaveLength(2);
    const reqNums = result[0].otherRequests.map((r) => r.request_number);
    expect(reqNums).toContain(2);
    expect(reqNums).toContain(3);
  });

  it('deduplicates the same request appearing multiple times for one material', () => {
    // Same request, two items with same material_id (edge case)
    const rows: RawMatchRow[] = [
      makeRow({ id: 'item-2a', request_id: 'req-2', material_id: 'mat-1', requests: { id: 'req-2', request_number: 2 } }),
      makeRow({ id: 'item-2b', request_id: 'req-2', material_id: 'mat-1', requests: { id: 'req-2', request_number: 2 } }),
    ];

    const result = groupMatchRows(rows, 'req-1');

    expect(result).toHaveLength(1);
    expect(result[0].otherRequests).toHaveLength(1);
    expect(result[0].otherRequests[0].request_id).toBe('req-2');
  });

  it('produces separate match entries for distinct materials', () => {
    const rows: RawMatchRow[] = [
      makeRow({ id: 'item-2', request_id: 'req-2', material_id: 'mat-1', description: 'Cemento', requests: { id: 'req-2', request_number: 2 } }),
      makeRow({ id: 'item-3', request_id: 'req-3', material_id: 'mat-2', description: 'Hierro', requests: { id: 'req-3', request_number: 3 } }),
    ];

    const result = groupMatchRows(rows, 'req-1');

    expect(result).toHaveLength(2);
    const matIds = result.map((r) => r.material_id);
    expect(matIds).toContain('mat-1');
    expect(matIds).toContain('mat-2');
  });

  it('excludes rows from the current request even when mixed with other requests', () => {
    const rows: RawMatchRow[] = [
      makeRow({ id: 'item-self', request_id: 'req-1', material_id: 'mat-1', requests: { id: 'req-1', request_number: 1 } }),
      makeRow({ id: 'item-other', request_id: 'req-2', material_id: 'mat-1', requests: { id: 'req-2', request_number: 2 } }),
    ];

    const result = groupMatchRows(rows, 'req-1');

    expect(result).toHaveLength(1);
    expect(result[0].otherRequests).toHaveLength(1);
    expect(result[0].otherRequests[0].request_id).toBe('req-2');
  });
});
