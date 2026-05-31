export type RequestStatus = 'pendiente' | 'en_curso' | 'recibido' | 'rechazado';

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  'pendiente',
  'en_curso',
  'recibido',
  'rechazado',
] as const;

export type ItemSubState = 'sin_pedir' | 'en_oc' | 'parcial' | 'recibido';

export const ITEM_SUB_STATES: readonly ItemSubState[] = [
  'sin_pedir',
  'en_oc',
  'parcial',
  'recibido',
] as const;

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  recibido: 'Recibido',
  rechazado: 'Rechazado',
};

export type ArchitectLabel =
  | 'Pendiente de aprobación'
  | 'Aprobado'
  | 'Rechazado'
  | 'Pendiente de entrega'
  | 'Entregado parcial'
  | 'Entregado completo';

export function getArchitectLabel(
  status: RequestStatus,
  items: readonly { status: string }[],
): ArchitectLabel {
  if (status === 'pendiente') return 'Pendiente de aprobación';
  if (status === 'rechazado') return 'Rechazado';
  if (status === 'recibido') return 'Entregado completo';

  const hasRecibido = items.some(i => i.status === 'recibido' || i.status === 'parcial');
  const hasEnOc = items.some(i => i.status === 'en_oc');

  if (hasRecibido) return 'Entregado parcial';
  if (hasEnOc) return 'Pendiente de entrega';
  return 'Aprobado';
}

export const ARCHITECT_BADGE_VARIANTS: Record<
  ArchitectLabel,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  'Pendiente de aprobación': { variant: 'outline' },
  'Aprobado':                { variant: 'outline', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  'Rechazado':               { variant: 'destructive' },
  'Pendiente de entrega':    { variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  'Entregado parcial':       { variant: 'outline', className: 'bg-orange-100 text-orange-800 border-orange-300' },
  'Entregado completo':      { variant: 'default', className: 'bg-green-600 text-white border-green-600 hover:bg-green-600' },
};

export const ARCHITECT_COLUMN_TITLES: Record<RequestStatus, string> = {
  pendiente: 'Pendiente de aprobación',
  en_curso: 'En proceso',
  recibido: 'Entregado completo',
  rechazado: 'Rechazado',
};

export const STATUS_BADGE_VARIANTS: Record<
  RequestStatus,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  pendiente: { variant: 'outline' },
  en_curso:  { variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  recibido:  { variant: 'default', className: 'bg-green-600 text-white border-green-600 hover:bg-green-600' },
  rechazado: { variant: 'destructive' },
};

export const ITEM_SUB_STATE_COLORS: Record<ItemSubState, { bg: string; label: string }> = {
  sin_pedir: { bg: 'bg-gray-300',  label: 'Sin pedir' },
  en_oc:     { bg: 'bg-blue-500',  label: 'En OC' },
  parcial:   { bg: 'bg-amber-500', label: 'Parcial' },
  recibido:  { bg: 'bg-green-500', label: 'Recibido' },
};

export const ARCHITECT_ITEM_LABELS: Record<ItemSubState, string> = {
  sin_pedir: 'Pendiente',
  en_oc:     'En compra',
  parcial:   'Entrega parcial',
  recibido:  'Entregado',
};

export interface KanbanColumnConfig {
  status: RequestStatus;
  title: string;
  headerColor: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnConfig[] = [
  { status: 'pendiente', title: 'Pendiente', headerColor: 'border-gray-400' },
  { status: 'en_curso',  title: 'En curso',  headerColor: 'border-amber-400' },
  { status: 'recibido',  title: 'Recibido',  headerColor: 'border-green-500' },
  { status: 'rechazado', title: 'Rechazado', headerColor: 'border-red-500' },
] as const;

export type TransitionResult = 'ALLOW' | 'VALIDATED' | 'MODAL' | 'BLOCK' | 'NOOP';

export function getTransitionType(from: RequestStatus, to: RequestStatus): TransitionResult {
  if (from === to) return 'NOOP';
  if (from === 'rechazado') return 'BLOCK';
  if (to === 'rechazado') return 'MODAL';
  if (from === 'recibido') return 'BLOCK';
  if (to === 'recibido') return 'VALIDATED';
  return 'ALLOW';
}

// Procurement routing: how the item is obtained. Orthogonal to delivery location.
export type ItemRouting = 'inventario' | 'cotizacion' | 'orden_directa' | 'pendiente';

export interface RequestItem {
  id: string;
  request_id: string;
  material_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  status: ItemSubState;
  routing: ItemRouting;
  observations: string | null;
  quantity_received: number;
  quantity_ordered: number;
  match_confidence: string | null;
  created_at: string;
}

export interface RequestItemWithMaterial extends RequestItem {
  materials: { name: string; unit: string } | null;
}

export interface RequestWithItems {
  id: string;
  request_number: number;
  status: RequestStatus;
  company_id: string;
  created_by: string | null;
  architect_id: string | null;
  project_id: string | null;
  raw_message: string | null;
  observations: string | null;
  desired_date: string | null;
  motivo_rechazo: string | null;
  nota_rechazo: string | null;
  rechazado_at: string | null;
  rechazado_by: string | null;
  requires_review: boolean;
  created_at: string;
  updated_at: string;
  whatsapp_message_id: string | null;
  request_items: RequestItem[];
  architects: { full_name: string } | null;
  projects: { id: string; name: string } | null;
}

export interface RequestDetail extends Omit<RequestWithItems, 'request_items'> {
  request_items: RequestItemWithMaterial[];
}

export interface TimelineEvent {
  id: string;
  tipo: string;
  descripcion: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name: string;
}

export function isItemReceivable(status: ItemSubState, qtyReceived: number, qty: number): boolean {
  return (status === 'en_oc' || status === 'parcial') && qtyReceived < qty;
}

export const REJECTION_REASONS = [
  'Sin presupuesto disponible',
  'Material duplicado en otro requerimiento',
  'Error en cantidades o especificacion',
  'Cambio de plan de obra',
  'Cotizacion fuera de mercado',
  'Otro',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];
