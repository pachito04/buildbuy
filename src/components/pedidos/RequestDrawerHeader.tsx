import { Badge } from "@/components/ui/badge";
import {
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS,
  type RequestDetail,
} from "@/lib/kanban-types";

interface RequestDrawerHeaderProps {
  request: RequestDetail;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

export function RequestDrawerHeader({ request }: RequestDrawerHeaderProps) {
  const badgeConfig = STATUS_BADGE_VARIANTS[request.status];
  const atraso = getAtraso(request.desired_date, request.status);

  return (
    <div className="space-y-3">
      {/* Line 1: REQ ID + status badge */}
      <div className="flex items-center gap-3 pr-10">
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>
          {formatRequestNumber(request.request_number)}
        </h2>
        <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
          {STATUS_LABELS[request.status]}
        </Badge>
        {request.urgente && (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-800 border-amber-300"
          >
            Urgente
          </Badge>
        )}
      </div>

      {/* Line 2: Atraso badge */}
      {atraso !== null && (
        <div>
          <span
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#E04444",
            }}
          >
            ⚠️ Atrasado {atraso} días
          </span>
        </div>
      )}

      {/* Line 3: Grid info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <span
            className="uppercase text-muted-foreground block tracking-wider"
            style={{ fontSize: 10 }}
          >
            Obra
          </span>
          <span className="font-medium" style={{ fontSize: 12 }}>
            {request.projects?.name ?? "Sin obra"}
          </span>
        </div>
        <div>
          <span
            className="uppercase text-muted-foreground block tracking-wider"
            style={{ fontSize: 10 }}
          >
            Arquitecto
          </span>
          <span className="font-medium" style={{ fontSize: 12 }}>
            {request.architects?.full_name ?? "—"}
          </span>
        </div>
        <div>
          <span
            className="uppercase text-muted-foreground block tracking-wider"
            style={{ fontSize: 10 }}
          >
            Creado
          </span>
          <span style={{ fontSize: 12 }}>{formatDate(request.created_at)}</span>
        </div>
        <div>
          <span
            className="uppercase text-muted-foreground block tracking-wider"
            style={{ fontSize: 10 }}
          >
            Entrega
          </span>
          <span style={{ fontSize: 12 }}>
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
