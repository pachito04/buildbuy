export type MatchConfidence = 'high' | 'medium' | 'low';

export function getMatchConfidence(score: number): MatchConfidence {
  if (score > 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

export const MATCH_COLORS: Record<MatchConfidence, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-green-100', text: 'text-green-800', label: 'Alta confianza' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Revisar' },
  low:    { bg: 'bg-red-100',   text: 'text-red-800',   label: 'Sin match' },
};

export interface ComputoAvanceItem {
  computo_item_id: string;
  computo_id: string;
  project_id: string;
  rubro: string;
  descripcion_origen: string;
  material_id: string | null;
  unidad: string;
  cantidad_estimada: number;
  precio_unit_estimado: number;
  subtotal_estimado: number;
  agregado_retroactivamente: boolean;
  orden_dentro_rubro: number | null;
  cantidad_pedida: number;
  cantidad_recibida: number;
  monto_pedido: number;
  monto_recibido: number;
}

export interface ObraKPIs {
  presupuesto: number;
  comprometido: number;
  recibido: number;
  desvio: number;
  pctEjecutado: number;
}

export interface RubroAvance {
  rubro: string;
  presupuesto: number;
  comprometido: number;
  recibido: number;
  itemCount: number;
}

export function calcularKPIs(items: ComputoAvanceItem[]): ObraKPIs {
  const presupuesto = items.reduce((s, i) => s + Number(i.subtotal_estimado), 0);
  const comprometido = items.reduce((s, i) => s + Number(i.monto_pedido), 0);
  const recibido = items.reduce((s, i) => s + Number(i.monto_recibido), 0);
  const desvio = comprometido - presupuesto;
  const pctEjecutado = presupuesto > 0 ? (recibido / presupuesto) * 100 : 0;
  return { presupuesto, comprometido, recibido, desvio, pctEjecutado };
}

export function agruparPorRubro(items: ComputoAvanceItem[]): RubroAvance[] {
  const map = new Map<string, RubroAvance>();
  for (const item of items) {
    const existing = map.get(item.rubro);
    if (existing) {
      existing.presupuesto += Number(item.subtotal_estimado);
      existing.comprometido += Number(item.monto_pedido);
      existing.recibido += Number(item.monto_recibido);
      existing.itemCount += 1;
    } else {
      map.set(item.rubro, {
        rubro: item.rubro,
        presupuesto: Number(item.subtotal_estimado),
        comprometido: Number(item.monto_pedido),
        recibido: Number(item.monto_recibido),
        itemCount: 1,
      });
    }
  }
  return Array.from(map.values());
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}
