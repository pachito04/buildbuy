import { Badge } from "@/components/ui/badge";
import {
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS,
  ARCHITECT_BADGE_VARIANTS,
  getArchitectLabel,
  type RequestDetail,
} from "@/lib/kanban-types";
import { isUrgente } from "@/hooks/useUrgencyThreshold";

interface RequestDetailModalHeaderProps {
  request: RequestDetail;
  thresholdDays: number;
  role: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (!hasTime) return date;
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function getAtraso(dateStr: string | null, status: string): number | null {
  if (!dateStr || status === "recibido" || status === "rechazado") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const days = Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return days < 0 ? Math.abs(days) : null;
}

function formatRequestNumber(num: number): string {
  return `REQ-${num.toString().padStart(4, "0")}`;
}

export function RequestDetailModalHeader({ request, thresholdDays, role }: RequestDetailModalHeaderProps) {
  const isArquitecto = role === 'arquitecto';
  const archLabel = isArquitecto
    ? getArchitectLabel(request.status, request.request_items ?? [])
    : null;
  const badgeConfig = isArquitecto
    ? ARCHITECT_BADGE_VARIANTS[archLabel!]
    : STATUS_BADGE_VARIANTS[request.status];
  const atraso = getAtraso(request.desired_date, request.status);

  return (
    <div className="space-y-3">
      {/* Line 1: REQ ID + status badge */}
      <div className="pr-10">
        <span className="eyebrow">Requerimiento</span>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {formatRequestNumber(request.request_number)}
          </h2>
          <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
            {isArquitecto ? archLabel : STATUS_LABELS[request.status]}
          </Badge>
          {isUrgente(request.desired_date, thresholdDays) && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-300"
            >
              Urgente
            </Badge>
          )}
        </div>
      </div>

      {/* Line 2: Atraso badge */}
      {atraso !== null && (
        <div>
          <span className="inline-flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
            ⚠️ Atrasado {atraso} días
          </span>
        </div>
      )}

      {/* Line 3: Grid info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span className="eyebrow block mb-0.5">
            Obra
          </span>
          <span className="text-sm font-medium">
            {request.projects?.name ?? "Sin obra"}
          </span>
        </div>
        <div>
          <span className="eyebrow block mb-0.5">
            Arquitecto
          </span>
          <span className="text-sm font-medium">
            {request.architects?.full_name ?? "—"}
          </span>
        </div>
        <div>
          <span className="eyebrow block mb-0.5">
            Creado
          </span>
          <span className="text-sm">{formatDate(request.created_at)}</span>
        </div>
        <div>
          <span className="eyebrow block mb-0.5">
            Entrega deseada
          </span>
          <span className="text-sm">
            {formatDate(request.desired_date)}
          </span>
        </div>
      </div>

      {/* Rejection info */}
      {request.status === "rechazado" && (
        <div className="rounded-md bg-destructive/10 p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">
            Motivo: {request.motivo_rechazo ?? "—"}
          </p>
          {request.nota_rechazo && (
            <p className="text-sm text-muted-foreground">
              {request.nota_rechazo}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Rechazado el {formatDate(request.rechazado_at)}
          </p>
        </div>
      )}
    </div>
  );
}
