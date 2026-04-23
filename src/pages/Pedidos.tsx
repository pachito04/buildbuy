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
  CheckCircle,
  XCircle,
  FileText,
  Warehouse,
  AlertCircle,
  Send,
  Pencil,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ItemRow {
  material_id: string;
  description: string;
  quantity: string;
  unit: string;
}

// Status labels for admin/compras (show internal states)
const adminStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  draft:             { label: "Borrador",              variant: "secondary"   },
  pending_approval:  { label: "Pendiente Aprobación",  variant: "outline"     },
  approved:          { label: "Aprobado",              variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  in_pool:           { label: "En Pool",               variant: "outline"     },
  rfq_direct:        { label: "RFQ Directo",           variant: "outline"     },
  inventario:        { label: "Inventario",            variant: "outline"     },
  rejected:          { label: "Rechazado",             variant: "destructive" },
};

const arqStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  draft:             { label: "Borrador",              variant: "secondary"   },
  pending_approval:  { label: "Enviado",               variant: "outline"     },
  approved:          { label: "Aprobado",              variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  in_pool:           { label: "En proceso",            variant: "outline"     },
  rfq_direct:        { label: "En proceso",            variant: "outline"     },
  inventario:        { label: "Aprobado",              variant: "default"     },
  rejected:          { label: "Rechazado",             variant: "destructive" },
};

const EMPTY_ITEM: ItemRow = { material_id: "", description: "", quantity: "1", unit: "" };

export default function Pedidos() {
  const [open, setOpen] = useState(false);
  const [rawMessage, setRawMessage] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [projectId, setProjectId] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [filter, setFilter] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();
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
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select(
          "*, request_items(*), architects:architect_id(full_name), projects:project_id(name)"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── Create request ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
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
        }))
      );
      if (ie) throw ie;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      setOpen(false);
      resetForm();
      toast({
        title: "Pedido creado",
        description: "El pedido fue enviado para revisión.",
      });
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

  const filtered =
    requests?.filter((r) => {
      if (filter === "all") return true;
      if (role === "arquitecto" && filter === "approved") {
        return ["approved", "in_pool", "rfq_direct", "inventario"].includes(r.status);
      }
      return r.status === filter;
    }) || [];

  const filterOptions = canProcess
    ? ["all", "pending_approval", "approved", "in_pool", "rejected"]
    : ["all", "draft", "pending_approval", "approved", "rejected"];

  const filterLabels: Record<string, string> = {
    all:               "Todos",
    draft:             "Borrador",
    pending_approval:  "Pendiente",
    approved:          "Aprobado",
    in_pool:           "En Pool",
    rejected:          "Rechazado",
  };

  // Only block actual arquitecto users (not admins previewing as arquitecto)
  const isActualArqWithoutProfile = actualRole === "arquitecto" && myArchitect === null;
  const isArqWithoutProfile = isActualArqWithoutProfile;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {role === "arquitecto" ? "Mis Pedidos" : "Gestión de Pedidos"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {role === "arquitecto"
              ? "Requerimientos de materiales para obra"
              : "Pedidos recibidos desde obra"}
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
                    <div key={i} className="flex gap-2 items-center">
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

                      {/* Unit — always visible, shows "—" until material selected */}
                      <span className="text-sm text-muted-foreground w-10 shrink-0 text-center">
                        {item.unit || "—"}
                      </span>

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

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createMutation.isPending || !companyId || isArqWithoutProfile
                  }
                >
                  {createMutation.isPending
                    ? "Creando..."
                    : isArqWithoutProfile
                    ? "Sin perfil de arquitecto asociado"
                    : "Crear Pedido"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {filterLabels[s] ?? s}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">
              No hay pedidos{filter !== "all" ? " con ese estado" : ""}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
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
                      <Badge variant="destructive">Urgente</Badge>
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
                  {r.status === "pending_approval" && canProcess && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: r.id, status: "approved" });
                        }}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: r.id, status: "rejected" });
                        }}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Rechazar
                      </Button>
                    </div>
                  )}
                  {r.status === "approved" && canProcess && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); navigate("/rfqs"); }}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        RFQ Directo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: r.id, status: "inventario" });
                          navigate("/inventario");
                        }}
                      >
                        <Warehouse className="h-3 w-3 mr-1" />
                        Surtir de Inventario
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog (read-only) */}
      <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalle del Pedido</DialogTitle>
          </DialogHeader>
          {(() => {
            const r = requests?.find((req) => req.id === detailId);
            if (!r) return null;
            const projName = (r as any).projects?.name;
            const archName = (r as any).architects?.full_name;
            const sl = statusLabels[r.status] ?? { label: r.status, variant: "secondary" as const };
            const canEdit = r.status === "draft" && role === "arquitecto" && r.created_by === user?.id;

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {projName || `Pedido #${(r as any).request_number}`}
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
                        </tr>
                      </thead>
                      <tbody>
                        {r.request_items.map((it: any) => (
                          <tr key={it.id} className="border-t">
                            <td className="px-3 py-1.5">{it.description}</td>
                            <td className="text-right px-3 py-1.5 font-medium">{it.quantity}</td>
                            <td className="px-3 py-1.5">{it.unit || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEditDraft(r)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Modificar borrador
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateStatus.mutate({ id: r.id, status: "pending_approval" });
                        setDetailId(null);
                      }}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Enviar para Aprobación
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
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
