import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_VARIANTS, STATUS_LABELS, type RequestDetail } from "@/lib/kanban-types";

interface RequestDrawerHeaderProps {
  request: RequestDetail;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatRequestNumber(num: number): string {
  return `REQ-${num.toString().padStart(4, '0')}`;
}

export function RequestDrawerHeader({ request }: RequestDrawerHeaderProps) {
  const badgeConfig = STATUS_BADGE_VARIANTS[request.status];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">{formatRequestNumber(request.request_number)}</h2>
        <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
          {STATUS_LABELS[request.status]}
        </Badge>
        {request.urgente && (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
            Urgente
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Obra: </span>
          <span className="font-medium">{request.projects?.name ?? 'Sin obra'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Arquitecto: </span>
          <span className="font-medium">{request.architects?.full_name ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Creado: </span>
          <span>{formatDate(request.created_at)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Entrega: </span>
          <span>{formatDate(request.desired_date)}</span>
        </div>
      </div>

      {request.status === 'rechazado' && (
        <div className="rounded-md bg-destructive/10 p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">
            Motivo: {request.motivo_rechazo ?? '—'}
          </p>
          {request.nota_rechazo && (
            <p className="text-sm text-muted-foreground">{request.nota_rechazo}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Rechazado el {formatDate(request.rechazado_at)}
          </p>
        </div>
      )}
    </div>
  );
}
