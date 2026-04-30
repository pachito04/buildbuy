import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

interface PedidosGridProps {
  requests: any[];
  statusLabels: Record<string, StatusConfig>;
  onRowClick: (r: any) => void;
}

export function PedidosGrid({ requests, statusLabels, onRowClick }: PedidosGridProps) {
  if (!requests.length) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No hay requerimientos con esos filtros.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-3 font-medium">N° Pedido</th>
            <th className="text-left px-4 py-3 font-medium">Fecha generación</th>
            <th className="text-left px-4 py-3 font-medium">Fecha entrega</th>
            <th className="text-left px-4 py-3 font-medium">Obra</th>
            <th className="text-left px-4 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const sl = statusLabels[r.status] ?? { label: r.status, variant: "secondary" as const };
            const projName = r.projects?.name;

            return (
              <tr
                key={r.id}
                className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onRowClick(r)}
              >
                <td className="px-4 py-3 font-mono font-medium">
                  #{r.request_number}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("es-AR")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.desired_date
                    ? new Date(r.desired_date).toLocaleDateString("es-AR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {projName ?? "Sin obra"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={sl.variant} className={sl.className}>
                    {sl.label}
                  </Badge>
                  {r.urgency === "urgente" && (
                    <Badge className="ml-1 bg-[#FF2800] text-white border-[#FF2800]">
                      Urgente
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
