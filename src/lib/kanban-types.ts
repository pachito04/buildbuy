export type RequestStatus = 'pendiente' | 'procesado_parcial' | 'procesado_total' | 'rechazado';

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  'pendiente',
  'procesado_parcial',
  'procesado_total',
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
  procesado_parcial: 'Procesado parcial',
  procesado_total: 'Procesado total',
  rechazado: 'Rechazado',
};

export const STATUS_BADGE_VARIANTS: Record<
  RequestStatus,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  pendiente:         { variant: 'outline' },
  procesado_parcial: { variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  procesado_total:   { variant: 'default', className: 'bg-green-600 text-white border-green-600 hover:bg-green-600' },
  rechazado:         { variant: 'destructive' },
};

export const ITEM_SUB_STATE_COLORS: Record<ItemSubState, { bg: string; label: string }> = {
  sin_pedir: { bg: 'bg-gray-300',  label: 'Sin pedir' },
  en_oc:     { bg: 'bg-blue-500',  label: 'En OC' },
  parcial:   { bg: 'bg-amber-500', label: 'Parcial' },
  recibido:  { bg: 'bg-green-500', label: 'Recibido' },
};

export interface KanbanColumnConfig {
  status: RequestStatus;
  title: string;
  headerColor: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnConfig[] = [
  { status: 'pendiente',         title: 'Pendiente',         headerColor: 'border-gray-400' },
  { status: 'procesado_parcial', title: 'Procesado parcial', headerColor: 'border-amber-400' },
  { status: 'procesado_total',   title: 'Procesado total',   headerColor: 'border-green-500' },
  { status: 'rechazado',         title: 'Rechazado',         headerColor: 'border-red-500' },
] as const;

export type TransitionResult = 'ALLOW' | 'VALIDATED' | 'MODAL' | 'BLOCK' | 'NOOP';

export function getTransitionType(from: RequestStatus, to: RequestStatus): TransitionResult {
  if (from === to) return 'NOOP';
  if (from === 'rechazado') return 'BLOCK';
  if (to === 'rechazado') return 'MODAL';
  if (from === 'procesado_total') return 'BLOCK';
  if (to === 'procesado_total') return 'VALIDATED';
  return 'ALLOW';
}

export interface RequestItem {
  id: string;
  request_id: string;
  material_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  status: ItemSubState;
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
  urgente: boolean;
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

export const REJECTION_REASONS = [
  'Sin presupuesto disponible',
  'Material duplicado en otro requerimiento',
  'Error en cantidades o especificacion',
  'Cambio de plan de obra',
  'Cotizacion fuera de mercado',
  'Otro',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];
