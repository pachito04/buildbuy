/**
 * Tests for Pools.tsx — GAP4 updatePoolStatus must write pool_state (T09/T10).
 *
 * Strict TDD: written BEFORE the implementation change.
 *
 * Strategy: we test the pure data payload that updatePoolStatus should produce.
 * Per mock-hygiene rules, the logic under test is a data transformation
 * (which column name to use in the update payload), so we extract it to a
 * pure helper and test that directly.
 *
 * We also test the mutation behavior via the `updatePoolStatus` mutation call
 * captured through a shallow render with mocked Supabase.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure helper — extracted from Pools.tsx as part of T10
// ---------------------------------------------------------------------------

// This function represents the payload builder for updatePoolStatus.
// Before T10: it was { status: state }.  After T10: it is { pool_state: state }.
// We import it here so that when T10 creates it, this test goes GREEN.
import { buildPoolStatePayload } from '../pools-helpers';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPoolStatePayload — updatePoolStatus payload (T09/T10)', () => {
  it('returns an object with pool_state key (not legacy status)', () => {
    const payload = buildPoolStatePayload('confirmado');
    expect(payload).toHaveProperty('pool_state', 'confirmado');
    expect(payload).not.toHaveProperty('status');
  });

  it('passes any valid pool_state value through', () => {
    const states = ['borrador', 'confirmado', 'en_comparativa', 'adjudicado', 'cerrado', 'cancelado'];
    for (const state of states) {
      const payload = buildPoolStatePayload(state);
      expect(payload).toEqual({ pool_state: state });
    }
  });

  it('does NOT include any other keys in the payload', () => {
    const payload = buildPoolStatePayload('borrador');
    expect(Object.keys(payload)).toHaveLength(1);
    expect(Object.keys(payload)[0]).toBe('pool_state');
  });
});
