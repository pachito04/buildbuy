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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, CheckCircle, XCircle, FileText, Warehouse } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ItemRow {
  material_id: string;   // inventory.material_id
  description: string;   // display name
  quantity: string;
  unit: string;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:     { label: "Borrador",    variant: "secondary" },
  approved:  { label: "Aprobado",    variant: "default"   },
  in_pool:   { label: "En Pool",     variant: "outline"   },
  rfq_direct:{ label: "RFQ Directo", variant: "outline"   },
  inventario:{ label: "Inventario",  variant: "outline"   },
  rejected:  { label: "Rechazado",   variant: "destructive"},
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

  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { viewRole: role, companyId } = useViewRole();
  const qc = useQueryClient();

  const canCreate  = role === "arquitecto" || role === "compras" || role === "admin";
  const canProcess = role === "compras" || role === "admin";

  // ── Profile (company_id) ─────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const profileCompanyId = profile?.company_id ?? companyId;

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

  // Auto-set architectId when the architect record is found
  const [architectId, setArchitectId] = useState("");
  useEffect(() => {
    if (myArchitect?.id) setArchitectId(myArchitect.id);
  }, [myArchitect?.id]);

  // ── Inventory materials (private catalog) ────────────────────────────────
  const { data: inventoryMaterials } = useQuery({
    queryKey: ["inventory-materials", profileCompanyId],
    enabled: !!profileCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("material_id, quantity, materials(name, unit)")
        .gt("quantity", 0)   // only show materials with stock
        .order("materials(name)");
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        material_id: row.material_id,
        name: row.materials?.name ?? "—",
        unit: row.materials?.unit ?? "",
        stock: Number(row.quantity),
      }));
    },
  });

  // ── Projects & architects (for compras/admin selectors) ──────────────────
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: architects } = useQuery({
    queryKey: ["architects-list"],
    enabled: role !== "arquitecto",
    queryFn: async () => {
      const { data, error } = await supabase.from("architects").select("id, full_name").order("full_name");
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
        .select("*, request_items(*), architects:architect_id(full_name), projects:project_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── Create request ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profileCompanyId) throw new Error("Usuario sin empresa asignada");
      const validItems = items.filter((i) => i.material_id);
      if (!validItems.length) throw new Error("Agregá al menos un material");

      const { data: req, error } = await supabase
        .from("requests")
        .insert({
          company_id:   profileCompanyId,
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
      setOpen(false);
      resetForm();
      toast({ title: "Pedido creado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("requests").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Estado actualizado" });
    },
  });

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
    const mat = inventoryMaterials?.find((m) => m.material_id === material_id);
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

  const filtered = requests?.filter((r) => filter === "all" || r.status === filter) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Gestión de Pedidos</h1>
          <p className="text-muted-foreground text-sm mt-1">Pedidos recibidos desde obra</p>
        </div>

        {canCreate && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo Pedido</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Pedido</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">

                {/* Architect row */}
                {role === "arquitecto" ? (
                  <div className="p-3 rounded-lg bg-muted/60 text-sm">
                    <span className="text-muted-foreground">Arquitecto: </span>
                    <span className="font-medium">{myArchitect?.full_name ?? "—"}</span>
                    {!myArchitect && (
                      <p className="text-xs text-destructive mt-1">
                        Tu usuario no tiene un perfil de arquitecto asociado. Pedile al admin que lo vincule.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Arquitecto</Label>
                      <Select value={architectId} onValueChange={setArchitectId}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {architects?.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Proyecto / Obra</Label>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {projects?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Project (for arquitecto) */}
                {role === "arquitecto" && (
                  <div className="space-y-2">
                    <Label>Proyecto / Obra</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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
                    <Label>Fecha deseada</Label>
                    <Input type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
                  </div>
                </div>

                {/* Materials from inventory */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Materiales *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 mr-1" />Agregar
                    </Button>
                  </div>

                  {!inventoryMaterials?.length && (
                    <p className="text-xs text-muted-foreground">
                      No hay materiales con stock en el inventario. Cargá materiales primero.
                    </p>
                  )}

                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      {/* Material selector */}
                      <div className="flex-1">
                        <Select value={item.material_id} onValueChange={(v) => selectMaterial(i, v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar material..." />
                          </SelectTrigger>
                          <SelectContent>
                            {inventoryMaterials?.map((m) => (
                              <SelectItem key={m.material_id} value={m.material_id}>
                                {m.name}
                                <span className="text-muted-foreground ml-1 text-xs">
                                  (stock: {m.stock} {m.unit})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quantity */}
                      <Input
                        className="w-24"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Cant."
                        value={item.quantity}
                        onChange={(e) => updateQty(i, e.target.value)}
                      />

                      {/* Unit (read-only, auto-filled) */}
                      <span className="text-sm text-muted-foreground w-10 shrink-0">{item.unit}</span>

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

                <Button type="submit" className="w-full" disabled={createMutation.isPending || !profileCompanyId}>
                  {createMutation.isPending ? "Creando..." : "Crear Pedido"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "draft", "approved", "in_pool", "rejected"].map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "all" ? "Todos" : statusLabels[s]?.label || s}
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
            <p className="text-sm">No hay pedidos.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-display">#{r.id.slice(0, 8)}</CardTitle>
                  <Badge variant={statusLabels[r.status]?.variant || "secondary"}>
                    {statusLabels[r.status]?.label || r.status}
                  </Badge>
                  {r.urgency === "urgente" && <Badge variant="destructive">Urgente</Badge>}
                  {r.urgency === "alta" && <Badge className="bg-warning text-warning-foreground">Alta</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("es-AR")}
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {(r as any).projects?.name    && <span>🏗️ {(r as any).projects.name}</span>}
                  {(r as any).architects?.full_name && <span>👷 {(r as any).architects.full_name}</span>}
                  {r.desired_date               && <span>📅 {new Date(r.desired_date).toLocaleDateString("es-AR")}</span>}
                </div>
                {r.raw_message && <p className="text-sm text-muted-foreground">{r.raw_message}</p>}
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
                            <td className="px-3 py-2">{it.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.status === "draft" && canProcess && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}>
                      <CheckCircle className="h-3 w-3 mr-1" />Aprobar
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive"
                      onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })}>
                      <XCircle className="h-3 w-3 mr-1" />Rechazar
                    </Button>
                  </div>
                )}
                {r.status === "approved" && canProcess && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/rfqs")}>
                      <FileText className="h-3 w-3 mr-1" />RFQ Directo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      updateStatus.mutate({ id: r.id, status: "inventario" });
                      navigate("/inventario");
                    }}>
                      <Warehouse className="h-3 w-3 mr-1" />Surtir de Inventario
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
