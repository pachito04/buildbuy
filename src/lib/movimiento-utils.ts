import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MovimientoTipo =
  | "destino_asignado"
  | "oc_emitida"
  | "recepcion"
  | "despacho"
  | "rechazo"
  | "consolidacion";

export type MovimientoInsert =
  Database["public"]["Tables"]["movimiento_producto"]["Insert"];

// ---------------------------------------------------------------------------
// Pure: labels
// ---------------------------------------------------------------------------

export const MOVIMIENTO_TIPO_LABELS: Record<MovimientoTipo, string> = {
  destino_asignado: "Destino asignado",
  oc_emitida: "OC emitida",
  recepcion: "Recepción",
  despacho: "Despacho",
  rechazo: "Rechazo",
  consolidacion: "Consolidación",
};

// ---------------------------------------------------------------------------
// Pure: origen builder
// ---------------------------------------------------------------------------

/**
 * Returns 'Requerimiento #N' for a valid number, or '' for null/undefined.
 */
export function movimientoOrigenRequerimiento(
  requestNumber: number | null | undefined,
): string {
  if (requestNumber == null) return "";
  return `Requerimiento #${requestNumber}`;
}

// ---------------------------------------------------------------------------
// Pure: routing → destino display string
// ---------------------------------------------------------------------------

const ROUTING_DESTINO_MAP: Record<string, string> = {
  inventario: "Inventario",
  cotizacion: "Cotización",
  orden_directa: "Orden directa",
  pendiente: "Sin asignar",
};

/**
 * Converts a routing key to a human-readable destino string.
 * Unknown values are passed through unchanged.
 */
export function routingToDestino(routing: string): string {
  return ROUTING_DESTINO_MAP[routing] ?? routing;
}

// ---------------------------------------------------------------------------
// Pure: format a single movement row for display
// ---------------------------------------------------------------------------

export function formatMovimiento(row: {
  tipo: string;
  origen: string | null;
  destino: string | null;
  cantidad: number | null;
  created_at: string;
}): string {
  const label = MOVIMIENTO_TIPO_LABELS[row.tipo as MovimientoTipo] ?? row.tipo;
  const from = row.origen ? `${row.origen} → ` : "";
  const to = row.destino ?? "—";
  const qty = row.cantidad != null ? ` (${row.cantidad})` : "";
  const date = new Date(row.created_at).toLocaleString("es-AR");
  return `[${label}] ${from}${to}${qty} — ${date}`;
}

// ---------------------------------------------------------------------------
// Best-effort IO: never throws, never blocks the caller
// ---------------------------------------------------------------------------

/**
 * Inserts one row into movimiento_producto.
 * If the insert fails for any reason the error is swallowed.
 * The caller MUST await this AFTER primary writes succeed.
 */
export async function logMovimiento(
  client: SupabaseClient<Database>,
  row: MovimientoInsert,
): Promise<void> {
  try {
    const { error } = await client.from("movimiento_producto").insert(row as any);
    // Best-effort: a failure must never block the caller, but it should be
    // diagnosable (PostgREST returns errors via `.error`, not by throwing — an
    // RLS/CHECK rejection would otherwise be completely invisible).
    if (error) {
      console.warn("[logMovimiento] insert failed (best-effort):", error.message);
    }
  } catch (e) {
    // Intentionally swallowed — logging is best-effort and must never block
    // routing confirmation, OC generation, or reception.
    console.warn("[logMovimiento] threw (best-effort):", e);
  }
}
