# Proposal: rfq-numero-correlativo

> **Separate change** — distinct from `consolidacion-requerimientos-fixes`.
> Bug is pre-existing and transversal; documented separately so it stays clear in the brain/openspec sync.

## Problem

The `rfqs` table has no human-readable sequential identifier. Only `id` (UUID) exists.
Every view that displays an RFQ falls back to `SC #<first-8-hex>`, which is cryptic and not user-friendly.
This is a cross-cutting pre-existing bug unrelated to the Módulo 1 consolidation work.

## Goal

Give each SC a stable short number like `SC #41`, consistent with how `requests` already has `request_number`.

## Decision: mechanism

Replicate the `request_number` pattern:
- Postgres sequence auto-assigns numbers
- Default on column so no application code change needed for inserts
- Backfill existing rows ordered by `created_at, id`
- Global counter (not per-company) — consistent with `request_number`

## Scope

- 1 new migration file
- 1 type update (`types.ts`)
- 7 UI locations (fallback label only — existing priorities preserved)
- 5 query selects updated to include `rfq_number`

## Non-scope

- No change to `create_consolidated_rfq` RPC (already inserts without `rfq_number`, will pick up default automatically)
- No change to row-level security
- No per-company numbering
