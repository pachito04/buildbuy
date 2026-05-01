import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Warehouse,
  AlertCircle,
  Send,
  Pencil,
  MessageSquare,
} from "lucide-react";
import { PedidosFilters } from "@/components/pedidos/PedidosFilters";
import { PedidosGrid } from "@/components/pedidos/PedidosGrid";
import { PedidosBoard } from "@/components/pedidos/PedidosBoard";
import { PedidoDetail } from "@/components/pedidos/PedidoDetail";

interface ItemRow {
  material_id: string;
  description: string;
  quantity: string;
  unit: string;
  observations: string;
}

// Status labels for admin/compras (show internal states)
const adminStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  pending_approval:    { label: "Pendiente",            variant: "outline"     },
  approved:            { label: "Pendiente",            variant: "outline"     },
  in_pool:             { label: "Procesado total",      variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  rfq_direct:          { label: "Procesado total",      variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  inventario:          { label: "Procesado total",      variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  procesado_parcial:   { label: "Procesado parcial",    variant: "outline", className: "bg-amber-100 text-amber-800 border-amber-300" },
  rejected:            { label: "Rechazado",            variant: "destructive" },
};

const arqStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  draft:               { label: "Borrador",              variant: "secondary"   },
  pending_approval:    { label: "Pendiente",              variant: "outline"     },
  approved:            { label: "Aprobado",              variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  in_pool:             { label: "En proceso",            variant: "outline"     },
  rfq_direct:          { label: "En proceso",            variant: "outline"     },
  inventario:          { label: "En proceso",            variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  procesado_parcial:   { label: "En proceso",            variant: "outline"     },
  rejected:            { label: "Rechazado",             variant: "destructive" },
};

const EMPTY_ITEM: ItemRow = { material_id: "", description: "", quantity: "1", unit: "", observations: "" };

export default function Pedidos() {
  const [open, setOpen] = useState(false);
  const [rawMessage, setRawMessage] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [projectId, setProjectId] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [filter, setFilter] = useState<string>("all");
  const [obraFilter, setObraFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "board">("grid");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [surtidoRequestId, setSurtidoRequestId] = useState<string | null>(null);
  const [directaRequestId, setDirectaRequestId] = useState<string | null>(null);
  const [directaDeadline, setDirectaDeadline] = useState("");
  const [directaClosing, setDirectaClosing] = useState("");
  const [directaLocation, setDirectaLocation] = useState("");
  const [directaNotes, setDirectaNotes] = useState("");
  const [expandedObs, setExpandedObs] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const { user } = useAuth();
  const { viewRole: role, actualRole, companyId } = useViewRole();
  const qc = useQueryClient();

  const canCreate  = role === "arquitecto" || role === "compras" || role === "admin";
  const canProcess = role === "compras" || role === "admin";

  const statusLabels = role === "arquitecto" ? arqStatusLabels : adminStatusLabels;

  // ── Auto-detect architect for the logged-in user ─────────────────────────
  const { data: myArchitect } = useQuery({
    queryKey: ["my-architect", user?.id],
    enabled: !!user?.id && role === "arquitecto",
    queryFn: async () => {
      const { data } = await supabase
        .from("architects")
        .select("id, full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [architectId, setArchitectId] = useState("");
  useEffect(() => {
    if (myArchitect?.id) setArchitectId(myArchitect.id);
  }, [myArchitect?.id]);

  // ── ALL materials (not filtered by stock) ────────────────────────────────
  const { data: allMaterials } = useQuery({
    queryKey: ["all-materials", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: mats, error } = await supabase
        .from("materials")
        .select("id, name, unit")
        .eq("active", true)
        .order("name");
      if (error) throw error;

      // Get stock from inventory for display context only
      const { data: inv } = await supabase
        .from("inventory")
        .select("material_id, quantity");
      const stockMap: Record<string, number> = {};
      inv?.forEach((row: any) => {
        stockMap[row.material_id] = Number(row.quantity);
      });

      return (mats ?? []).map((m: any) => ({
        material_id: m.id,
        name: m.name,
        unit: m.unit ?? "",
        stock: stockMap[m.id] ?? 0,
      }));
    },
  });

  // ── Projects ─────────────────────────────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // ── Architects list (admin/compras only) ─────────────────────────────────
  const { data: architects } = useQuery({
    queryKey: ["architects-list"],
    enabled: role !== "arquitecto",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("architects")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // ── Requests list ────────────────────────────────────────────────────────
  const { data: requests, isLoading } = useQuery({
    queryKey: ["requests", role, user?.id],
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select(
          "*, request_items(*), architects:architect_id(full_name), projects:project_id(name)"
        )
        .order("created_at", { ascending: false });

      if (role === "arquitecto") {
        query = query.eq("created_by", user!.id);
      } else if (role === "compras") {
        query = query.neq("status", "draft" as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // ── Create request ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (targetStatus: string = "draft") => {
      if (!companyId) throw new Error("Usuario sin empresa asignada");
      if (role === "arquitecto" && !myArchitect)
        throw new Error("Tu usuario no tiene perfil de arquitecto asociado");
      const validItems = items.filter((i) => i.material_id);
      if (!validItems.length) throw new Error("Agregá al menos un material");

      const { data: req, error } = await supabase
        .from("requests")
        .insert({
          company_id:   companyId,
          raw_message:  rawMessage || null,
          urgency,
          created_by:   user?.id,
          project_id:   projectId || null,
          architect_id: architectId || null,
          desired_date: desiredDate || null,
          ...(targetStatus !== "draft" ? { status: targetStatus as any } : {}),
        })
        .select()
        .single();
      if (error) throw error;

      const { error: ie } = await supabase.from("request_items").insert(
        validItems.map((i) => ({
          request_id:  req.id,
          material_id: i.material_id,
          description: i.description,
          quantity:    parseFloat(i.quantity) || 1,
          unit:        i.unit,
          observations: i.observations || null,
        }))
      );
      if (ie) throw ie;

      return { targetStatus, requestNumber: req.request_number };
    },
    onSuccess: ({ targetStatus, requestNumber }) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      setOpen(false);
      resetForm();
      if (targetStatus === "pending_approval") {
        toast({
          title: "¡Requerimiento generado!",
          description: `Tu requerimiento N#${requestNumber} fue generado con éxito.`,
        });
      } else {
        toast({
          title: "Borrador guardado",
          description: "Tu pedido fue guardado como borrador.",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("requests")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      toast({ title: "Estado actualizado" });
    },
  });

  const updateDraft = useMutation({
    mutationFn: async () => {
      if (!editingId || !companyId) return;
      const validItems = items.filter((i) => i.material_id);
      if (!validItems.length) throw new Error("Agregá al menos un material");

      const { error } = await supabase
        .from("requests")
        .update({
          raw_message: rawMessage || null,
          urgency,
          project_id: projectId || null,
          architect_id: architectId || null,
          desired_date: desiredDate || null,
        })
        .eq("id", editingId);
      if (error) throw error;

      const { error: delErr } = await supabase
        .from("request_items")
        .delete()
        .eq("request_id", editingId);
      if (delErr) throw delErr;

      const { error: ie } = await supabase.from("request_items").insert(
        validItems.map((i) => ({
          request_id: editingId,
          material_id: i.material_id,
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit,
          observations: i.observations || null,
        }))
      );
      if (ie) throw ie;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      setEditingId(null);
      resetForm();
      toast({ title: "Borrador actualizado" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Surtido de inventario ─────────────────────────────────────────────
  const surtidoRequest = requests?.find((r: any) => r.id === surtidoRequestId);

  const { data: surtidoStock } = useQuery({
    queryKey: ["surtido-stock", surtidoRequestId],
    enabled: !!surtidoRequestId && !!surtidoRequest,
    queryFn: async () => {
      const reqItems = (surtidoRequest as any)?.request_items || [];
      const materialIds = reqItems.map((i: any) => i.material_id).filter(Boolean);
      if (!materialIds.length) return [];

      const { data: inv } = await supabase
        .from("inventory")
        .select("material_id, quantity")
        .in("material_id", materialIds);

      const stockMap: Record<string, number> = {};
      inv?.forEach((row: any) => { stockMap[row.material_id] = Number(row.quantity); });

      return reqItems.map((item: any) => {
        const stock = item.material_id ? (stockMap[item.material_id] ?? 0) : 0;
        const requested = Number(item.quantity) || 0;
        const toFulfill = Math.min(requested, stock);
        const remaining = requested - toFulfill;
        return {
          ...item,
          stock,
          requested,
          toFulfill,
          remaining,
          hasStock: toFulfill > 0,
          needsRfq: remaining > 0,
        };
      });
    },
  });

  const hasAnyStock = surtidoStock?.some((i: any) => i.hasStock);
  const hasRfqItems = surtidoStock?.some((i: any) => i.needsRfq);
  const allFullyStocked = surtidoStock?.every((i: any) => !i.needsRfq);

  const surtidoMutation = useMutation({
    mutationFn: async () => {
      if (!surtidoRequestId || !surtidoStock || !companyId || !user) throw new Error("Datos incompletos");

      const itemsToFulfill = surtidoStock.filter((i: any) => i.hasStock);
      const itemsForRfq = surtidoStock.filter((i: any) => i.needsRfq);

      // 1. Deduct inventory for fulfilled items
      for (const item of itemsToFulfill) {
        const { error: mvErr } = await supabase.from("inventory_movements").insert({
          company_id: companyId,
          material_id: item.material_id,
          movement_type: "salida",
          quantity: item.toFulfill,
          reason: `Surtido pedido #${(surtidoRequest as any)?.request_number}`,
          request_id: surtidoRequestId,
          created_by: user.id,
        });
        if (mvErr) throw mvErr;

        const newQty = item.stock - item.toFulfill;
        const { error: invErr } = await supabase
          .from("inventory")
          .update({ quantity: newQty })
          .eq("material_id", item.material_id);
        if (invErr) throw invErr;
      }

      // 2. Create RFQ draft for remaining items
      let rfqCreated = false;
      if (itemsForRfq.length > 0) {
        const { data: rfq, error: rfqErr } = await supabase
          .from("rfqs")
          .insert({
            company_id: companyId,
            request_id: surtidoRequestId,
            rfq_type: "open",
            observations: `Generado automáticamente — ítems faltantes del pedido #${(surtidoRequest as any)?.request_number}`,
            created_by: user.id,
            status: "draft",
          } as any)
          .select()
          .single();
        if (rfqErr) throw rfqErr;

        const rfqItems = itemsForRfq.map((item: any) => ({
          rfq_id: (rfq as any).id,
          description: item.description,
          quantity: item.remaining,
          unit: item.unit,
          ...(item.material_id ? { material_id: item.material_id } : {}),
        }));
        const { error: riErr } = await supabase.from("rfq_items").insert(rfqItems);
        if (riErr) throw riErr;
        rfqCreated = true;
      }

      // 3. Update request status
      const newStatus = allFullyStocked ? "inventario" : "procesado_parcial";
      const { error: stErr } = await supabase
        .from("requests")
        .update({ status: newStatus as any })
        .eq("id", surtidoRequestId);
      if (stErr) throw stErr;

      // 4. Notify architect
      const projectName = (surtidoRequest as any)?.projects?.name || "Sin obra";
      const reqNum = (surtidoRequest as any)?.request_number;
      const architectUserId = (surtidoRequest as any)?.created_by;

      if (architectUserId) {
        let msg: string;
        let detail: string;

        if (allFullyStocked) {
          msg = `Pedido #${reqNum} surtido de inventario`;
          detail = `Tu pedido #${reqNum} de ${projectName} fue surtido de inventario y ya se encuentra en camino a la dirección de obra especificada.`;
        } else {
          const surtidos = itemsToFulfill.map((i: any) => `${i.description} (${i.toFulfill} ${i.unit})`).join(", ");
          msg = `Pedido #${reqNum} parcialmente surtido`;
          detail = `Tu pedido #${reqNum} de ${projectName} fue parcialmente surtido de inventario en los materiales: ${surtidos}. El resto del pedido fue enviado a proveedores.`;
        }

        await supabase.from("notificaciones").insert({
          company_id: companyId,
          user_id: architectUserId,
          type: "request_approved" as any,
          message: msg,
          metadata: { request_id: surtidoRequestId, detail_message: detail },
        });
      }

      return { rfqCreated };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      setSurtidoRequestId(null);
      const msg = result?.rfqCreated
        ? "Inventario descontado y solicitud de cotización generada para los faltantes. Revisala en la sección de Solicitudes."
        : "Inventario descontado exitosamente.";
      toast({ title: "Surtido completado", description: msg });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Solicitud Directa (RFQ from request) ─────────────────────────────
  const directaRequest = requests?.find((r: any) => r.id === directaRequestId);

  const { data: directaItems } = useQuery({
    queryKey: ["directa-items", directaRequestId],
    enabled: !!directaRequestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_items")
        .select("id, material_id, description, quantity, unit")
        .eq("request_id", directaRequestId!)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createDirectRfq = useMutation({
    mutationFn: async () => {
      if (!directaRequestId || !directaItems?.length) throw new Error("Sin ítems");
      if (!directaClosing) throw new Error("La fecha de cierre es obligatoria");
      if (!directaDeadline) throw new Error("La fecha de entrega es obligatoria");
      if (!directaLocation.trim()) throw new Error("El lugar de entrega es obligatorio");
      if (!companyId) throw new Error("Sin empresa");

      const { data: rfq, error } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          request_id: directaRequestId,
          rfq_type: "open",
          deadline: directaDeadline,
          closing_datetime: directaClosing,
          delivery_location: directaLocation,
          observations: directaNotes || null,
          created_by: user?.id,
          status: "sent",
        } as any)
        .select()
        .single();
      if (error) throw error;

      const rfqItems = directaItems.map((it: any) => ({
        rfq_id: (rfq as any).id,
        description: it.description,
        quantity: Number(it.quantity) || 1,
        unit: it.unit,
        material_id: it.material_id,
      }));
      const { error: ie } = await supabase.from("rfq_items").insert(rfqItems);
      if (ie) throw ie;

      await supabase
        .from("requests")
        .update({ status: "rfq_direct" as any })
        .eq("id", directaRequestId);

      try {
        await supabase.functions.invoke("notify-providers", {
          body: { type: "rfq_sent", rfq_id: (rfq as any).id },
        });
      } catch (_) {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      setDirectaRequestId(null);
      setDirectaDeadline("");
      setDirectaClosing("");
      setDirectaLocation("");
      setDirectaNotes("");
      toast({ title: "Solicitud de cotización enviada", description: "Se creó el RFQ y se envió a proveedores." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openEditDraft(r: any) {
    setRawMessage(r.raw_message || "");
    setUrgency(r.urgency || "normal");
    setProjectId(r.project_id || "");
    setArchitectId(r.architect_id || myArchitect?.id || "");
    setDesiredDate(r.desired_date || "");
    setItems(
      r.request_items?.length
        ? r.request_items.map((it: any) => ({
            material_id: it.material_id || "",
            description: it.description || "",
            quantity: String(it.quantity),
            unit: it.unit || "",
            observations: it.observations || "",
          }))
        : [{ ...EMPTY_ITEM }]
    );
    setDetailId(null);
    setEditingId(r.id);
  }

  function resetForm() {
    setRawMessage("");
    setProjectId("");
    if (!myArchitect) setArchitectId("");
    setDesiredDate("");
    setItems([{ ...EMPTY_ITEM }]);
    setExpandedObs(new Set());
  }

  // ── Item helpers ─────────────────────────────────────────────────────────
  const addItem = () => setItems([...items, { ...EMPTY_ITEM }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const selectMaterial = (i: number, material_id: string) => {
    // If the same material already exists in another row → merge quantities
    const dupeIdx = items.findIndex(
      (item, idx) => idx !== i && item.material_id === material_id
    );
    if (dupeIdx !== -1) {
      const copy = [...items];
      const totalQty =
        (parseFloat(copy[dupeIdx].quantity) || 0) + (parseFloat(copy[i].quantity) || 1);
      copy[dupeIdx] = { ...copy[dupeIdx], quantity: String(totalQty) };
      copy.splice(i, 1);
      setItems(copy.length ? copy : [{ ...EMPTY_ITEM }]);
      toast({
        title: "Material combinado",
        description: "Se sumaron las cantidades del material repetido.",
      });
      return;
    }

    const mat = allMaterials?.find((m) => m.material_id === material_id);
    const copy = [...items];
    copy[i] = {
      material_id,
      description: mat?.name ?? "",
      unit:        mat?.unit ?? "",
      quantity:    copy[i].quantity || "1",
    };
    setItems(copy);
  };

  const updateQty = (i: number, quantity: string) => {
    const copy = [...items];
    copy[i] = { ...copy[i], quantity };
    setItems(copy);
  };

  const filtered = (requests ?? [])
    .filter((r) => {
      if (filter !== "all") {
        if (role === "arquitecto" && filter === "approved") {
          if (!["approved", "in_pool", "rfq_direct", "inventario", "procesado_parcial"].includes(r.status)) return false;
        } else if (canProcess && filter === "pendiente") {
          if (!["pending_approval", "approved"].includes(r.status)) return false;
        } else if (canProcess && filter === "procesado_total") {
          if (!["inventario", "rfq_direct", "in_pool"].includes(r.status)) return false;
        } else if (canProcess && filter === "procesado_parcial") {
          if (r.status !== "procesado_parcial") return false;
        } else {
          if (r.status !== filter) return false;
        }
      }
      if (obraFilter !== "all" && r.project_id !== obraFilter) return false;
      if (dateFrom && r.created_at < dateFrom) return false;
      if (dateTo && r.created_at.slice(0, 10) > dateTo) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filterOptions = canProcess
    ? ["all", "pendiente", "procesado_parcial", "procesado_total", "rejected"]
    : ["all", "draft", "pending_approval", "approved", "rejected"];

  const filterLabels: Record<string, string> = {
    all:                "Todos",
    draft:              "Borrador",
    pending_approval:   "Pendiente",
    pendiente:          "Pendiente",
    approved:           "Aprobado",
    procesado_parcial:  "Procesado parcial",
    procesado_total:    "Procesado total",
    rejected:           "Rechazado",
  };

  // Only block actual arquitecto users (not admins previewing as arquitecto)
  const isActualArqWithoutProfile = actualRole === "arquitecto" && myArchitect === null;
  const isArqWithoutProfile = isActualArqWithoutProfile;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {role === "arquitecto" ? "Mis Requerimientos" : "Gestión de Requerimientos"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {role === "arquitecto"
              ? "Requerimientos de materiales para obra"
              : "Requerimientos recibidos desde obra"}
          </p>
        </div>

        {canCreate && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Pedido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Pedido</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                {/* Architect display / selector */}
                {role === "arquitecto" && actualRole === "arquitecto" ? (
                  // Actual arquitecto user: show their linked profile
                  <div className="p-3 rounded-lg bg-muted/60 text-sm">
                    <span className="text-muted-foreground">Arquitecto: </span>
                    <span className="font-medium">
                      {myArchitect?.full_name ?? "—"}
                    </span>
                    {isArqWithoutProfile && (
                      <div className="flex items-start gap-2 mt-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          Tu usuario no tiene un perfil de arquitecto asociado. Pedile
                          al administrador que te vincule desde el módulo Arquitectos.
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Admin/compras (or admin previewing as arquitecto): full selector
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Arquitecto</Label>
                      <Select value={architectId} onValueChange={setArchitectId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {architects?.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Proyecto / Obra</Label>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Project selector — only for actual arquitecto users */}
                {role === "arquitecto" && actualRole === "arquitecto" && (
                  <div className="space-y-2">
                    <Label>Obra *</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar obra..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!projects?.length && (
                      <p className="text-xs text-muted-foreground">
                        No hay obras cargadas aún. Pedile al administrador que las
                        cree desde el módulo Obras.
                      </p>
                    )}
                  </div>
                )}

                {/* Urgency + desired date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Urgencia</Label>
                    <Select value={urgency} onValueChange={setUrgency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baja">Baja</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Entrega deseada</Label>
                    <Input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Materials */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Materiales *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addItem}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar fila
                    </Button>
                  </div>

                  {allMaterials !== undefined && !allMaterials.length && (
                    <p className="text-xs text-muted-foreground">
                      No hay materiales cargados. El administrador debe agregarlos
                      desde el módulo Materiales.
                    </p>
                  )}

                  {items.map((item, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Select
                            value={item.material_id}
                            onValueChange={(v) => selectMaterial(i, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar material..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allMaterials?.map((m) => (
                                <SelectItem key={m.material_id} value={m.material_id}>
                                  {m.name}
                                  <span className="text-muted-foreground ml-1 text-xs">
                                    {m.stock > 0
                                      ? `(stock: ${m.stock} ${m.unit})`
                                      : "(sin stock)"}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Input
                          className="w-20"
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Cant."
                          value={item.quantity}
                          onChange={(e) => updateQty(i, e.target.value)}
                        />

                        <span className="text-sm text-muted-foreground w-10 shrink-0 text-center">
                          {item.unit || "—"}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedObs((prev) => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })}
                        >
                          <MessageSquare className={`h-4 w-4 ${item.observations ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>

                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(i)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      {expandedObs.has(i) && (
                        <Input
                          className="ml-0 text-sm"
                          placeholder="Observación del material..."
                          value={item.observations}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, idx) =>
                                idx === i ? { ...it, observations: e.target.value } : it
                              )
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Observaciones</Label>
                  <Textarea
                    placeholder="Observaciones adicionales..."
                    value={rawMessage}
                    onChange={(e) => setRawMessage(e.target.value)}
                    rows={2}
                  />
                </div>

                <p className="text-xs text-muted-foreground">* Campo obligatorio</p>

                {role === "arquitecto" && actualRole === "arquitecto" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={createMutation.isPending || !companyId || isArqWithoutProfile}
                      onClick={() => createMutation.mutate("draft")}
                    >
                      {createMutation.isPending ? "Guardando..." : "Guardar en Borrador"}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={createMutation.isPending || !companyId || isArqWithoutProfile}
                      onClick={() => createMutation.mutate("pending_approval")}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {createMutation.isPending ? "Generando..." : "Generar Requerimiento"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createMutation.isPending || !companyId || isArqWithoutProfile}
                  >
                    {createMutation.isPending
                      ? "Creando..."
                      : isArqWithoutProfile
                      ? "Sin perfil de arquitecto asociado"
                      : "Crear Pedido"}
                  </Button>
                )}
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <PedidosFilters
        statusFilter={filter}
        onStatusFilterChange={setFilter}
        statusOptions={filterOptions}
        statusLabels={filterLabels}
        obraFilter={obraFilter}
        onObraFilterChange={setObraFilter}
        projects={projects ?? []}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={canProcess}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : canProcess && viewMode === "board" ? (
        <PedidosBoard
          requests={filtered}
          statusLabels={statusLabels}
          statusFilterOptions={filterOptions}
          statusFilterLabels={filterLabels}
          canProcess={canProcess}
          onCardClick={(r) => setDetailId(r.id)}
        />
      ) : canProcess && viewMode === "grid" ? (
        <PedidosGrid
          requests={filtered}
          statusLabels={statusLabels}
          onRowClick={(r) => setDetailId(r.id)}
        />
      ) : (
        <div className="space-y-3">
          {!filtered.length ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <p className="text-sm">
                  No hay pedidos{filter !== "all" ? " con ese estado" : ""}.
                </p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((r) => {
              const reqNum  = (r as any).request_number;
              const projName = (r as any).projects?.name;
              const archName = (r as any).architects?.full_name;
              const sl = statusLabels[r.status] ?? {
                label: r.status,
                variant: "secondary" as const,
              };

              return (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    if (r.status === "draft" && role === "arquitecto" && r.created_by === user?.id) {
                      openEditDraft(r);
                    } else {
                      setDetailId(r.id);
                    }
                  }}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-sm font-display">
                        {projName
                          ? projName
                          : `Pedido #${reqNum || r.request_number}`}
                      </CardTitle>
                      <Badge variant={sl.variant} className={sl.className}>{sl.label}</Badge>
                      {r.urgency === "urgente" && (
                        <Badge className="bg-[#FF2800] text-white border-[#FF2800]">Urgente</Badge>
                      )}
                      {r.urgency === "alta" && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                          Alta
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      Creado: {new Date(r.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>🏗️ {projName ?? "Sin obra asignada"}</span>
                      {archName && <span>👷 {archName}</span>}
                      {r.desired_date && (
                        <span>
                          📅 Entrega deseada:{" "}
                          {new Date(r.desired_date).toLocaleDateString("es-AR")}
                        </span>
                      )}
                      {reqNum && (
                        <span className="font-mono text-muted-foreground/50">
                          #{reqNum}
                        </span>
                      )}
                    </div>
                    {r.raw_message && (
                      <p className="text-sm text-muted-foreground">{r.raw_message}</p>
                    )}
                    {r.request_items && r.request_items.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-3 py-2">Material</th>
                              <th className="text-right px-3 py-2">Cantidad</th>
                              <th className="text-left px-3 py-2">Unidad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.request_items.map((it: any) => (
                              <tr key={it.id} className="border-t">
                                <td className="px-3 py-2">{it.description}</td>
                                <td className="text-right px-3 py-2">{it.quantity}</td>
                                <td className="px-3 py-2">{it.unit || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {r.status === "draft" && role === "arquitecto" && r.created_by === user?.id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openEditDraft(r); }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Modificar borrador
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStatus.mutate({ id: r.id, status: "pending_approval" });
                          }}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Enviar para Aprobación
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <PedidoDetail
        requestId={detailId}
        requests={requests ?? []}
        statusLabels={statusLabels}
        role={role ?? ""}
        canProcess={canProcess}
        userId={user?.id}
        onClose={() => setDetailId(null)}
        onEditDraft={(r) => { setDetailId(null); openEditDraft(r); }}
        onApprove={(id) => { updateStatus.mutate({ id, status: "approved" }); setDetailId(null); }}
        onReject={(id) => { updateStatus.mutate({ id, status: "rejected" }); setDetailId(null); }}
        onSurtir={(id) => { setDetailId(null); setSurtidoRequestId(id); }}
        onSolicitudDirecta={() => { const rid = detailId; setDetailId(null); setDirectaRequestId(rid); }}
        onSendForApproval={(id) => { updateStatus.mutate({ id, status: "pending_approval" }); setDetailId(null); }}
      />

      {/* Surtido de inventario dialog */}
      <Dialog open={!!surtidoRequestId} onOpenChange={(o) => { if (!o) setSurtidoRequestId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Surtir de Inventario</DialogTitle>
          </DialogHeader>
          {surtidoStock && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800">
                  {allFullyStocked
                    ? "Todos los materiales serán surtidos de inventario."
                    : "Solo se surtirán de inventario los ítems con stock disponible. Para el resto se generará una solicitud de cotización que compras deberá revisar y enviar a proveedores."}
                </p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2">Material</th>
                      <th className="text-right px-3 py-2">Solicitado</th>
                      <th className="text-right px-3 py-2">En stock</th>
                      <th className="text-right px-3 py-2">A surtir</th>
                      <th className="text-center px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surtidoStock.map((item: any) => (
                      <tr key={item.id} className={`border-t ${item.needsRfq ? "bg-amber-50/50" : ""}`}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="text-right px-3 py-2">{item.requested} {item.unit}</td>
                        <td className="text-right px-3 py-2 font-mono">{item.stock} {item.unit}</td>
                        <td className="text-right px-3 py-2 font-mono font-medium">{item.toFulfill} {item.unit}</td>
                        <td className="text-center px-3 py-2">
                          {item.needsRfq ? (
                            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                              {item.hasStock ? `Faltante: ${item.remaining}` : "Sin stock → Solicitud"}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-green-600">Completo</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasRfqItems && (
                <p className="text-xs text-muted-foreground">
                  Se creará una solicitud de cotización borrador con {surtidoStock.filter((i: any) => i.needsRfq).length} ítem(s) faltante(s) para que compras la revise y envíe.
                </p>
              )}

              {!hasAnyStock && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-800">No hay stock disponible para ningún ítem. Considerá generar una solicitud de cotización directa.</p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => surtidoMutation.mutate()}
                disabled={surtidoMutation.isPending || !hasAnyStock}
              >
                <Warehouse className="h-4 w-4 mr-2" />
                {surtidoMutation.isPending ? "Procesando..." : "Confirmar Surtido"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Solicitud Directa dialog */}
      <Dialog open={!!directaRequestId} onOpenChange={(o) => { if (!o) setDirectaRequestId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Solicitud Directa — Pedido #{directaRequest?.request_number || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {directaRequest?.projects?.name && (
              <p className="text-sm"><span className="text-muted-foreground">Obra:</span> {directaRequest.projects.name}</p>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-xs font-medium">Materiales del pedido</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Material</th>
                    <th className="text-right px-3 py-1.5">Cantidad</th>
                    <th className="text-left px-3 py-1.5">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {(directaItems ?? []).map((item: any) => (
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

            <Button
              className="w-full"
              onClick={() => createDirectRfq.mutate()}
              disabled={createDirectRfq.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {createDirectRfq.isPending ? "Enviando..." : "Emitir y Enviar a Proveedores"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit draft dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modificar Borrador</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateDraft.mutate();
            }}
            className="space-y-4"
          >
            {role === "arquitecto" && actualRole === "arquitecto" && (
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Urgencia</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entrega deseada</Label>
                <Input
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Materiales *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" />Agregar fila
                </Button>
              </div>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Select value={item.material_id} onValueChange={(v) => selectMaterial(i, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar material..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allMaterials?.map((m) => (
                          <SelectItem key={m.material_id} value={m.material_id}>
                            {m.name}
                            <span className="text-muted-foreground ml-1 text-xs">
                              {m.stock > 0 ? `(stock: ${m.stock} ${m.unit})` : "(sin stock)"}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    className="w-20"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Cant."
                    value={item.quantity}
                    onChange={(e) => updateQty(i, e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground w-10 shrink-0 text-center">
                    {item.unit || "—"}
                  </span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                placeholder="Observaciones adicionales..."
                value={rawMessage}
                onChange={(e) => setRawMessage(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={updateDraft.isPending}
              >
                {updateDraft.isPending ? "Guardando..." : "Guardar Borrador"}
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1"
                disabled={updateDraft.isPending}
                onClick={() => {
                  updateDraft.mutate(undefined, {
                    onSuccess: () => {
                      updateStatus.mutate({ id: editingId!, status: "pending_approval" });
                    },
                  });
                }}
              >
                <Send className="h-3 w-3 mr-1" />
                Guardar y Enviar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
