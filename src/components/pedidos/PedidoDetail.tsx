import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  FileText,
  Warehouse,
  Pencil,
  Send,
  Package,
  Clock,
  ShoppingCart,
} from "lucide-react";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

interface PedidoDetailProps {
  requestId: string | null;
  requests: any[];
  statusLabels: Record<string, StatusConfig>;
  role: string;
  canProcess: boolean;
  userId?: string;
  onClose: () => void;
  onEditDraft: (r: any) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSurtir: (id: string) => void;
  onSolicitudDirecta: () => void;
  onSendForApproval: (id: string) => void;
}

type ItemStatus = "pendiente" | "surtido" | "en_cotizacion" | "en_oc" | "oc_aceptada" | "oc_rechazada";

const itemStatusConfig: Record<ItemStatus, { label: string; icon: typeof Clock; color: string }> = {
  pendiente:      { label: "Pendiente",         icon: Clock,         color: "text-muted-foreground" },
  surtido:        { label: "Surtido inventario", icon: Package,       color: "text-green-600" },
  en_cotizacion:  { label: "En cotización",      icon: FileText,      color: "text-blue-600" },
  en_oc:          { label: "En orden de compra", icon: ShoppingCart,  color: "text-amber-600" },
  oc_aceptada:    { label: "OC aceptada",        icon: CheckCircle,   color: "text-green-600" },
  oc_rechazada:   { label: "OC rechazada",       icon: XCircle,       color: "text-red-600" },
};

export function PedidoDetail({
  requestId,
  requests,
  statusLabels,
  role,
  canProcess,
  userId,
  onClose,
  onEditDraft,
  onApprove,
  onReject,
  onSurtir,
  onSolicitudDirecta,
  onSendForApproval,
}: PedidoDetailProps) {
  const r = requests?.find((req) => req.id === requestId);

  const { data: itemStatuses } = useQuery({
    queryKey: ["item-statuses", requestId],
    enabled: !!requestId && !!r,
    queryFn: async () => {
      if (!requestId) return {};

      const materialIds = (r?.request_items || [])
        .map((it: any) => it.material_id)
        .filter(Boolean);

      if (!materialIds.length) return {};

      const [movementsRes, rfqsRes, posRes] = await Promise.all([
        supabase
          .from("inventory_movements")
          .select("material_id, quantity")
          .eq("request_id", requestId)
          .eq("movement_type", "salida"),
        supabase
          .from("rfqs")
          .select("id, status, rfq_items(material_id)")
          .eq("request_id", requestId),
        supabase
          .from("purchase_orders")
          .select("id, status, rfq_id, request_id")
          .eq("request_id", requestId),
      ]);

      const fulfilledMaterials = new Set(
        (movementsRes.data || []).map((m: any) => m.material_id)
      );

      const rfqMaterials = new Set<string>();
      const rfqIds = new Set<string>();
      (rfqsRes.data || []).forEach((rfq: any) => {
        rfqIds.add(rfq.id);
        (rfq.rfq_items || []).forEach((item: any) => {
          if (item.material_id) rfqMaterials.add(item.material_id);
        });
      });

      const poByRfq: Record<string, string> = {};
      (posRes.data || []).forEach((po: any) => {
        if (po.rfq_id) poByRfq[po.rfq_id] = po.status;
      });

      const hasAcceptedPO = Object.values(poByRfq).some((s) => s === "accepted");
      const hasRejectedPO = Object.values(poByRfq).some((s) => s === "rejected");
      const hasSentPO = Object.values(poByRfq).some((s) => s === "sent");

      const result: Record<string, ItemStatus> = {};
      materialIds.forEach((matId: string) => {
        if (fulfilledMaterials.has(matId)) {
          result[matId] = "surtido";
        } else if (rfqMaterials.has(matId)) {
          if (hasAcceptedPO) {
            result[matId] = "oc_aceptada";
          } else if (hasRejectedPO) {
            result[matId] = "oc_rechazada";
          } else if (hasSentPO) {
            result[matId] = "en_oc";
          } else {
            result[matId] = "en_cotizacion";
          }
        } else {
          result[matId] = "pendiente";
        }
      });

      return result;
    },
  });

  if (!r) return null;

  const projName = r.projects?.name;
  const archName = r.architects?.full_name;
  const sl = statusLabels[r.status] ?? { label: r.status, variant: "secondary" as const };
  const canEdit = r.status === "draft" && role === "arquitecto" && r.created_by === userId;
  const showItemStatuses = ["inventario", "procesado_parcial", "rfq_direct", "in_pool", "approved"].includes(r.status);

  return (
    <Dialog open={!!requestId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Detalle del Requerimiento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {projName || `Pedido #${r.request_number}`}
            </span>
            <Badge variant={sl.variant} className={sl.className}>{sl.label}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {projName && <p><span className="text-muted-foreground">Obra:</span> {projName}</p>}
            {archName && <p><span className="text-muted-foreground">Arquitecto:</span> {archName}</p>}
            <p><span className="text-muted-foreground">Urgencia:</span> {r.urgency}</p>
            {r.desired_date && (
              <p><span className="text-muted-foreground">Entrega:</span> {new Date(r.desired_date).toLocaleDateString("es-AR")}</p>
            )}
            <p><span className="text-muted-foreground">Creado:</span> {new Date(r.created_at).toLocaleDateString("es-AR")}</p>
          </div>

          {r.raw_message && (
            <p className="text-sm"><span className="text-muted-foreground">Observaciones:</span> {r.raw_message}</p>
          )}

          {r.request_items && r.request_items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-xs font-medium">Materiales</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Material</th>
                    <th className="text-right px-3 py-1.5">Cantidad</th>
                    <th className="text-left px-3 py-1.5">Unidad</th>
                    {showItemStatuses && <th className="text-left px-3 py-1.5">Estado</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.request_items.map((it: any) => {
                    const iStatus = itemStatuses?.[it.material_id] as ItemStatus | undefined;
                    const cfg = iStatus ? itemStatusConfig[iStatus] : null;
                    const Icon = cfg?.icon;

                    return (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-1.5">{it.description}</td>
                        <td className="text-right px-3 py-1.5 font-medium">{it.quantity}</td>
                        <td className="px-3 py-1.5">{it.unit || "—"}</td>
                        {showItemStatuses && (
                          <td className="px-3 py-1.5">
                            {cfg && Icon ? (
                              <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-xs">{cfg.label}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onEditDraft(r)}>
                <Pencil className="h-4 w-4 mr-2" />
                Modificar borrador
              </Button>
              <Button className="flex-1" onClick={() => onSendForApproval(r.id)}>
                <Send className="h-4 w-4 mr-2" />
                Enviar para Aprobación
              </Button>
            </div>
          )}

          {r.status === "pending_approval" && canProcess && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => onApprove(r.id)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Aprobar
              </Button>
              <Button variant="outline" className="flex-1 text-destructive" onClick={() => onReject(r.id)}>
                <XCircle className="h-4 w-4 mr-2" />
                Rechazar
              </Button>
            </div>
          )}

          {r.status === "approved" && canProcess && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onSolicitudDirecta}>
                <FileText className="h-4 w-4 mr-2" />
                Solicitud Directa
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => onSurtir(r.id)}>
                <Warehouse className="h-4 w-4 mr-2" />
                Surtir de Inventario
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
