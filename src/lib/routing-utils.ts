// Procurement routing for request items: HOW each item is obtained.
// Orthogonal to delivery location (deposito|obra), which is a separate concern.
export type Routing = 'inventario' | 'cotizacion' | 'orden_directa' | 'pendiente';

/**
 * Advisory suggestion only — never committed automatically.
 *
 * Rules:
 * - material_id === null → 'cotizacion' (no inventory record to reserve)
 * - quantity === 0       → 'inventario' (nothing to procure)
 * - available >= quantity → 'inventario'
 * - available < quantity  → 'cotizacion'
 */
export function suggestRouting(
  item: { quantity: number; material_id?: string | null },
  stock: { available: number },
): 'inventario' | 'cotizacion' {
  if (item.material_id === null) return 'cotizacion';
  if (item.quantity === 0) return 'inventario';
  return stock.available >= item.quantity ? 'inventario' : 'cotizacion';
}

/**
 * Guard: returns true only when the list is non-empty and every item
 * has a committed (non-pendiente) routing.
 */
export function canProcess(items: { routing: Routing }[]): boolean {
  if (items.length === 0) return false;
  return items.every((i) => i.routing !== 'pendiente');
}
