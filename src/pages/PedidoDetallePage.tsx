import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  XCircle,
  FileText,
  Warehouse,
  Send,
  Package,
  Clock,
  ShoppingCart,
  AlertCircle,
  Calendar,
} from "lucide-react";

const statusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  pending_approval:  { label: "Pendiente",         variant: "outline" },
  approved:          { label: "Pendiente",         variant: "outline" },
  in_pool:           { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  rfq_direct:        { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  inventario:        { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  procesado_parcial: { label: "Procesado parcial", variant: "outline", className: "bg-amber-100 text-amber-800 border-amber-300" },
  rejected:          { label: "Rechazado",         variant: "destructive" },
};

type ItemStatus = "pendiente" | "surtido" | "en_cotizacion" | "en_oc" | "oc_aceptada" | "oc_rechazada";

const itemStatusConfig: Record<ItemStatus, { label: string; icon: typeof Clock; color: string }> = {
  pendiente:     { label: "Pendiente",          icon: Clock,        color: "text-muted-foreground" },
  surtido:       { label: "Surtido inventario", icon: Package,      color: "text-green-600" },
  en_cotizacion: { label: "En cotización",      icon: FileText,     color: "text-blue-600" },
  en_oc:         { label: "En orden de compra", icon: ShoppingCart,  color: "text-amber-600" },
  oc_aceptada:   { label: "OC aceptada",        icon: CheckCircle,  color: "text-green-600" },
  oc_rechazada:  { label: "OC rechazada",       icon: XCircle,      color: "text-red-600" },
};

type ItemAction = "inventario" | "solicitud";

export default function PedidoDetallePage() {
  const { obraId, requestId } = useParams<{ obraId: string; requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { viewRole: role, companyId } = useViewRole();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canProcess = role === "compras" || role === "admin";

  const [itemActions, setItemActions] = useState<Record<string, ItemAction>>({});
  const [directaOpen, setDirectaOpen] = useState(false);
  const [directaDeadline, setDirectaDeadline] = useState("");
  const [directaClosing, setDirectaClosing] = useState("");
  const [directaLocation, setDirectaLocation] = useState("");
  const [directaNotes, setDirectaNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const isSinObra = obraId === "sin-obra";

  const { data: obra } = useQuery({
    queryKey: ["project", obraId],
    enabled: !isSinObra && !!obraId,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").eq("id", obraId!).maybeSingle();
      return data;
    },
  });

  const obraName = isSinObra ? "Sin obra asignada" : obra?.name ?? "...";

  const { data: r, isLoading } = useQuery({
    queryKey: ["request-detail", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*, request_items(*), architects:architect_id(full_name), projects:project_id(name)")
        .eq("id", requestId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isApproved = r?.status === "approved";

  // Stock per material — loaded when request is approved
  const { data: stockMap } = useQuery({
    queryKey: ["item-stock", requestId],
    enabled: isApproved && !!r,
    queryFn: async () => {
      const materialIds = (r?.request_items || []).map((i: any) => i.material_id).filter(Boolean);
      if (!materialIds.length) return {} as Record<string, number>;
      const { data: inv } = await supabase.from("inventory").select("material_id, quantity").in("material_id", materialIds);
      const map: Record<string, number> = {};
      inv?.forEach((row: any) => { map[row.material_id] = Number(row.quantity); });
      return map;
    },
  });

  // Default item actions based on stock when data loads
  useEffect(() => {
    if (!isApproved || !r?.request_items || !stockMap) return;
    if (Object.keys(itemActions).length > 0) return;
    const defaults: Record<string, ItemAction> = {};
    r.request_items.forEach((it: any) => {
      const stock = it.material_id ? (stockMap[it.material_id] ?? 0) : 0;
      defaults[it.id] = stock >= Number(it.quantity) ? "inventario" : "solicitud";
    });
    setItemActions(defaults);
  }, [isApproved, r?.request_items, stockMap]);

  // Item statuses for already-processed requests
  const { data: itemStatuses } = useQuery({
    queryKey: ["item-statuses", requestId],
    enabled: !!requestId && !!r && !isApproved,
    queryFn: async () => {
      const materialIds = (r?.request_items || []).map((it: any) => it.material_id).filter(Boolean);
      if (!materialIds.length) return {};

      const [movementsRes, rfqsRes, posRes] = await Promise.all([
        supabase.from("inventory_movements").select("material_id, quantity").eq("request_id", requestId!).eq("movement_type", "salida"),
        supabase.from("rfqs").select("id, status, rfq_items(material_id)").eq("request_id", requestId!),
        supabase.from("purchase_orders").select("id, status, rfq_id, request_id").eq("request_id", requestId!),
      ]);

      const fulfilledMaterials = new Set((movementsRes.data || []).map((m: any) => m.material_id));
      const rfqMaterials = new Set<string>();
      (rfqsRes.data || []).forEach((rfq: any) => {
        (rfq.rfq_items || []).forEach((item: any) => { if (item.material_id) rfqMaterials.add(item.material_id); });
      });

      const poByRfq: Record<string, string> = {};
      (posRes.data || []).forEach((po: any) => { if (po.rfq_id) poByRfq[po.rfq_id] = po.status; });

      const hasAcceptedPO = Object.values(poByRfq).some((s) => s === "accepted");
      const hasRejectedPO = Object.values(poByRfq).some((s) => s === "rejected");
      const hasSentPO = Object.values(poByRfq).some((s) => s === "sent");

      const result: Record<string, ItemStatus> = {};
      materialIds.forEach((matId: string) => {
        if (fulfilledMaterials.has(matId)) result[matId] = "surtido";
        else if (rfqMaterials.has(matId)) {
          if (hasAcceptedPO) result[matId] = "oc_aceptada";
          else if (hasRejectedPO) result[matId] = "oc_rechazada";
          else if (hasSentPO) result[matId] = "en_oc";
          else result[matId] = "en_cotizacion";
        } else result[matId] = "pendiente";
      });
      return result;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("requests").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["requests-obra"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      toast({ title: "Estado actualizado" });
    },
  });

  // Derived lists from per-item selections
  const inventarioItems = useMemo(
    () => (r?.request_items || []).filter((it: any) => itemActions[it.id] === "inventario"),
    [r?.request_items, itemActions]
  );
  const solicitudItems = useMemo(
    () => (r?.request_items || []).filter((it: any) => itemActions[it.id] === "solicitud"),
    [r?.request_items, itemActions]
  );

  // Bulk setters
  const setAllActions = (action: ItemAction) => {
    const next: Record<string, ItemAction> = {};
    (r?.request_items || []).forEach((it: any) => { next[it.id] = action; });
    setItemActions(next);
  };

  // --- Process inventario items (surtido) ---
  const processInventario = async () => {
    if (!requestId || !companyId || !user || !stockMap) throw new Error("Datos incompletos");

    for (const item of inventarioItems) {
      const stock = item.material_id ? (stockMap[item.material_id] ?? 0) : 0;
      const requested = Number(item.quantity) || 0;
      const toFulfill = Math.min(requested, stock);
      if (toFulfill <= 0) continue;

      const { error: mvErr } = await supabase.from("inventory_movements").insert({
        company_id: companyId, material_id: item.material_id, movement_type: "salida",
        quantity: toFulfill, reason: `Surtido pedido #${r?.request_number}`,
        request_id: requestId, created_by: user.id,
      });
      if (mvErr) throw mvErr;

      const { error: invErr } = await supabase.from("inventory").update({ quantity: stock - toFulfill }).eq("material_id", item.material_id);
      if (invErr) throw invErr;
    }
  };

  // --- Handle "Procesar selección" ---
  const handleProcess = async () => {
    setProcessing(true);
    try {
      const hasInv = inventarioItems.length > 0;
      const hasSol = solicitudItems.length > 0;

      if (hasInv) await processInventario();

      if (hasSol) {
        // Open solicitud dialog for solicitud items
        setProcessing(false);
        setDirectaOpen(true);
        return;
      }

      // All inventario — update status and notify
      const newStatus = "inventario";
      await supabase.from("requests").update({ status: newStatus as any }).eq("id", requestId!);

      const architectUserId = r?.created_by;
      if (architectUserId && companyId) {
        const projectName = r?.projects?.name || "Sin obra";
        await supabase.from("notificaciones").insert({
          company_id: companyId, user_id: architectUserId, type: "request_approved" as any,
          message: `Pedido #${r?.request_number} surtido de inventario`,
          metadata: { request_id: requestId, detail_message: `Tu pedido #${r?.request_number} de ${projectName} fue surtido de inventario y ya se encuentra en camino.` },
        });
      }

      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["requests-obra"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Surtido completado", description: "Inventario descontado exitosamente." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // --- Solicitud Directa (uses solicitudItems) ---
  const createDirectRfq = useMutation({
    mutationFn: async () => {
      const itemsToSend = solicitudItems.length > 0 ? solicitudItems : r?.request_items || [];
      if (!requestId || !itemsToSend.length) throw new Error("Sin ítems");
      if (!directaClosing) throw new Error("La fecha de cierre es obligatoria");
      if (!directaDeadline) throw new Error("La fecha de entrega es obligatoria");
      if (!directaLocation.trim()) throw new Error("El lugar de entrega es obligatorio");
      if (!companyId) throw new Error("Sin empresa");

      // If mixed: process inventario items first
      if (inventarioItems.length > 0) {
        await processInventario();
      }

      const { data: rfq, error } = await supabase.from("rfqs")
        .insert({ company_id: companyId, request_id: requestId, rfq_type: "open", deadline: directaDeadline, closing_datetime: directaClosing, delivery_location: directaLocation, observations: directaNotes || null, created_by: user?.id, status: "sent" } as any)
        .select().single();
      if (error) throw error;

      const rfqItems = itemsToSend.map((it: any) => ({ rfq_id: (rfq as any).id, description: it.description, quantity: Number(it.quantity) || 1, unit: it.unit, material_id: it.material_id }));
      const { error: ie } = await supabase.from("rfq_items").insert(rfqItems);
      if (ie) throw ie;

      const newStatus = inventarioItems.length > 0 ? "procesado_parcial" : "rfq_direct";
      await supabase.from("requests").update({ status: newStatus as any }).eq("id", requestId);

      // Notify architect
      const architectUserId = r?.created_by;
      if (architectUserId && companyId) {
        const projectName = r?.projects?.name || "Sin obra";
        const isMixed = inventarioItems.length > 0;
        const msg = isMixed ? `Pedido #${r?.request_number} procesado parcialmente` : `Pedido #${r?.request_number} enviado a cotización`;
        const detail = isMixed
          ? `Tu pedido #${r?.request_number} de ${projectName} fue parcialmente surtido de inventario. El resto fue enviado a proveedores.`
          : `Tu pedido #${r?.request_number} de ${projectName} fue enviado a proveedores para cotización.`;
        await supabase.from("notificaciones").insert({
          company_id: companyId, user_id: architectUserId, type: "request_approved" as any,
          message: msg, metadata: { request_id: requestId, detail_message: detail },
        });
      }

      try { await supabase.functions.invoke("notify-providers", { body: { type: "rfq_sent", rfq_id: (rfq as any).id } }); } catch (_) {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["requests-obra"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setDirectaOpen(false);
      setDirectaDeadline(""); setDirectaClosing(""); setDirectaLocation(""); setDirectaNotes("");
      const isMixed = inventarioItems.length > 0;
      toast({
        title: isMixed ? "Procesado parcial completado" : "Solicitud de cotización enviada",
        description: isMixed ? "Inventario descontado y solicitud enviada a proveedores." : "Se creó el RFQ y se envió a proveedores.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!r) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Requerimiento no encontrado.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(obraId ? `/pedidos/obra/${obraId}` : "/pedidos")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Volver
        </Button>
      </div>
    );
  }

  const sl = statusLabels[r.status] ?? { label: r.status, variant: "secondary" as const };
  const showItemStatuses = ["inventario", "procesado_parcial", "rfq_direct", "in_pool"].includes(r.status);

  return (
    <div className="p-6 space-y-6">
      {/* Navigation breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Requerimientos
        </Button>
        {obraId && (
          <>
            <span className="text-muted-foreground">/</span>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate(`/pedidos/obra/${obraId}`)}>
              <Building2 className="h-3.5 w-3.5" />
              {obraName}
            </Button>
          </>
        )}
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Pedido #{r.request_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Pedido #{r.request_number}</h1>
        <Badge variant={sl.variant} className={`text-sm ${sl.className || ""}`}>{sl.label}</Badge>
      </div>

      {/* Info grid */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {r.projects?.name && (
              <div>
                <p className="text-muted-foreground text-xs">Obra</p>
                <p className="font-medium">{r.projects.name}</p>
              </div>
            )}
            {r.architects?.full_name && (
              <div>
                <p className="text-muted-foreground text-xs">Arquitecto</p>
                <p className="font-medium">{r.architects.full_name}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Urgencia</p>
              <p className="font-medium capitalize">{r.urgency}</p>
            </div>
            {r.desired_date && (
              <div>
                <p className="text-muted-foreground text-xs">Entrega deseada</p>
                <p className="font-medium">{new Date(r.desired_date).toLocaleDateString("es-AR")}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Fecha de creación</p>
              <p className="font-medium">{new Date(r.created_at).toLocaleDateString("es-AR")}</p>
            </div>
          </div>
          {r.raw_message && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-muted-foreground text-xs mb-1">Observaciones</p>
              <p className="text-sm">{r.raw_message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Materials table */}
      {r.request_items && r.request_items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Materiales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Material</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cantidad</th>
                    <th className="text-left px-4 py-2.5 font-medium">Unidad</th>
                    {isApproved && <th className="text-right px-4 py-2.5 font-medium">Stock</th>}
                    {isApproved && <th className="text-left px-4 py-2.5 font-medium">Acción</th>}
                    {showItemStatuses && <th className="text-left px-4 py-2.5 font-medium">Estado</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.request_items.map((it: any) => {
                    const iStatus = itemStatuses?.[it.material_id] as ItemStatus | undefined;
                    const cfg = iStatus ? itemStatusConfig[iStatus] : null;
                    const Icon = cfg?.icon;
                    const stock = stockMap?.[it.material_id] ?? 0;
                    const requested = Number(it.quantity) || 0;
                    const action = itemActions[it.id];
                    const insufficientStock = action === "inventario" && stock < requested;

                    return (
                      <tr key={it.id} className={`border-t ${insufficientStock ? "bg-amber-50/50" : ""}`}>
                        <td className="px-4 py-2.5">{it.description}</td>
                        <td className="text-right px-4 py-2.5 font-medium">{it.quantity}</td>
                        <td className="px-4 py-2.5">{it.unit || "—"}</td>
                        {isApproved && (
                          <td className={`text-right px-4 py-2.5 font-mono ${stock === 0 ? "text-red-500" : stock < requested ? "text-amber-600" : "text-green-600"}`}>
                            {stock} {it.unit}
                          </td>
                        )}
                        {isApproved && (
                          <td className="px-4 py-2.5">
                            <Select
                              value={action || "solicitud"}
                              onValueChange={(v) => setItemActions((prev) => ({ ...prev, [it.id]: v as ItemAction }))}
                            >
                              <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inventario" disabled={stock === 0}>
                                  <span className="flex items-center gap-1.5">
                                    <Warehouse className="h-3 w-3" />Inventario
                                  </span>
                                </SelectItem>
                                <SelectItem value="solicitud">
                                  <span className="flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" />Solicitud
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {insufficientStock && stock > 0 && (
                              <p className="text-[10px] text-amber-600 mt-1">
                                Stock parcial: se surtirán {stock} de {requested}
                              </p>
                            )}
                          </td>
                        )}
                        {showItemStatuses && (
                          <td className="px-4 py-2.5">
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
          </CardContent>
        </Card>
      )}

      {/* Approve / Reject */}
      {r.status === "pending_approval" && canProcess && (
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}>
            <CheckCircle className="h-4 w-4 mr-2" />Aprobar
          </Button>
          <Button variant="outline" className="flex-1 text-destructive" onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })}>
            <XCircle className="h-4 w-4 mr-2" />Rechazar
          </Button>
        </div>
      )}

      {/* Approved — action buttons */}
      {isApproved && canProcess && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setAllActions("inventario"); }}>
              <Warehouse className="h-4 w-4 mr-2" />Surtido de inventario completo
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setAllActions("solicitud"); }}>
              <FileText className="h-4 w-4 mr-2" />Solicitud de Cotización
            </Button>
          </div>
          <Button
            className="w-full"
            onClick={handleProcess}
            disabled={processing || Object.keys(itemActions).length === 0}
          >
            <Send className="h-4 w-4 mr-2" />
            {processing ? "Procesando..." : `Procesar selección (${inventarioItems.length} inventario, ${solicitudItems.length} solicitud)`}
          </Button>
        </div>
      )}

      {/* Solicitud Directa dialog */}
      <Dialog open={directaOpen} onOpenChange={(o) => { setDirectaOpen(o); if (!o) { setDirectaDeadline(""); setDirectaClosing(""); setDirectaLocation(""); setDirectaNotes(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Solicitud de Cotización — Pedido #{r.request_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {r.projects?.name && (
              <p className="text-sm"><span className="text-muted-foreground">Obra:</span> {r.projects.name}</p>
            )}

            {inventarioItems.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                <Warehouse className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-blue-800">
                  {inventarioItems.length} ítem(s) se surtirán de inventario al confirmar.
                </p>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-xs font-medium">Materiales a cotizar ({solicitudItems.length})</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Material</th>
                    <th className="text-right px-3 py-1.5">Cantidad</th>
                    <th className="text-left px-3 py-1.5">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudItems.map((item: any) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-1.5">{item.description}</td>
                      <td className="text-right px-3 py-1.5 font-medium">{item.quantity}</td>
                      <td className="px-3 py-1.5">{item.unit || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cierre de cotización *</Label>
                <Input type="datetime-local" value={directaClosing} onChange={(e) => setDirectaClosing(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Entrega límite *</Label>
                <Input type="date" value={directaDeadline} onChange={(e) => setDirectaDeadline(e.target.value)} />
                {r.desired_date && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    El arquitecto solicitó entrega para el {new Date(r.desired_date + "T00:00:00").toLocaleDateString("es-AR")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lugar de entrega *</Label>
              <Input placeholder="Ej: Obra Norte, Av. Reforma 123" value={directaLocation} onChange={(e) => setDirectaLocation(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea placeholder="Notas para proveedores..." value={directaNotes} onChange={(e) => setDirectaNotes(e.target.value)} rows={2} />
            </div>

            <Button className="w-full" onClick={() => createDirectRfq.mutate()} disabled={createDirectRfq.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {createDirectRfq.isPending ? "Procesando..." : "Confirmar y Enviar a Proveedores"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
