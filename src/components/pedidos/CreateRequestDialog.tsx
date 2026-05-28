import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUrgencyThreshold, isUrgente } from "@/hooks/useUrgencyThreshold";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, MessageSquare, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";

interface ItemRow {
  material_id: string;
  description: string;
  quantity: string;
  unit: string;
  observations: string;
}

const EMPTY_ITEM: ItemRow = { material_id: "", description: "", quantity: "1", unit: "", observations: "" };

export function CreateRequestDialog() {
  const [open, setOpen] = useState(false);
  const [rawMessage, setRawMessage] = useState("");
  const [projectId, setProjectId] = useState("");
  const [architectId, setArchitectId] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [expandedObs, setExpandedObs] = useState<Set<number>>(new Set());

  const { user } = useAuth();
  const { viewRole: role, actualRole, companyId } = useViewRole();
  const thresholdDays = useUrgencyThreshold();
  const qc = useQueryClient();

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

  useEffect(() => {
    if (myArchitect?.id) setArchitectId(myArchitect.id);
  }, [myArchitect?.id]);

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

  const isArqWithoutProfile = actualRole === "arquitecto" && myArchitect === null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Usuario sin empresa asignada");
      if (role === "arquitecto" && !myArchitect)
        throw new Error("Tu usuario no tiene perfil de arquitecto asociado");
      const validItems = items.filter((i) => i.material_id);
      if (!validItems.length) throw new Error("Agrega al menos un material");

      const { data: req, error } = await supabase
        .from("requests")
        .insert({
          company_id: companyId,
          raw_message: rawMessage || null,
          created_by: user?.id,
          project_id: projectId || null,
          architect_id: architectId || null,
          desired_date: desiredDate || null,
          status: "pendiente" as any,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: ie } = await supabase.from("request_items").insert(
        validItems.map((i) => ({
          request_id: req.id,
          material_id: i.material_id,
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit,
          observations: i.observations || null,
        }))
      );
      if (ie) throw ie;

      try {
        await supabase.from("requerimiento_evento").insert({
          request_id: req.id,
          tipo: "creado",
          created_by: user?.id ?? null,
        });
      } catch (e) {
        console.error("Failed to insert creation event:", e);
      }

      return { requestNumber: req.request_number };
    },
    onSuccess: ({ requestNumber }) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      setOpen(false);
      resetForm();
      toast.success(`Requerimiento N#${requestNumber} creado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setRawMessage("");
    setProjectId("");
    if (!myArchitect) setArchitectId("");
    setDesiredDate("");
    setItems([{ ...EMPTY_ITEM }]);
    setExpandedObs(new Set());
  }

  const addItem = () => setItems([...items, { ...EMPTY_ITEM }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const selectMaterial = (i: number, material_id: string) => {
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
      toast.info("Se sumaron las cantidades del material repetido");
      return;
    }

    const mat = allMaterials?.find((m) => m.material_id === material_id);
    const copy = [...items];
    copy[i] = {
      material_id,
      description: mat?.name ?? "",
      unit: mat?.unit ?? "",
      quantity: copy[i].quantity || "1",
      observations: copy[i].observations ?? "",
    };
    setItems(copy);
  };

  const updateQty = (i: number, quantity: string) => {
    const copy = [...items];
    copy[i] = { ...copy[i], quantity };
    setItems(copy);
  };

  return (
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
          Nuevo requerimiento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo requerimiento</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          {role === "arquitecto" && actualRole === "arquitecto" ? (
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
                    al administrador que te vincule desde el modulo Arquitectos.
                  </span>
                </div>
              )}
            </div>
          ) : (
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
                  No hay obras cargadas aun. Pedile al administrador que las
                  cree desde el modulo Obras.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Entrega deseada</Label>
            <Input
              type="datetime-local"
              value={desiredDate}
              onChange={(e) => setDesiredDate(e.target.value)}
            />
            {desiredDate && isUrgente(desiredDate, thresholdDays) && (
              <p className="text-xs text-amber-600 font-medium">
                ⚠ Este requerimiento se marcará como urgente (≤ {thresholdDays} días)
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Materiales *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" />
                Agregar fila
              </Button>
            </div>

            {allMaterials !== undefined && !allMaterials.length && (
              <p className="text-xs text-muted-foreground">
                No hay materiales cargados. El administrador debe agregarlos
                desde el modulo Materiales.
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
                    onClick={() =>
                      setExpandedObs((prev) => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })
                    }
                  >
                    <MessageSquare
                      className={`h-4 w-4 ${item.observations ? "text-primary" : "text-muted-foreground"}`}
                    />
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
                    placeholder="Observacion del material..."
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

          <Button
            type="submit"
            className="w-full"
            disabled={createMutation.isPending || !companyId || isArqWithoutProfile}
          >
            {createMutation.isPending
              ? "Creando..."
              : isArqWithoutProfile
              ? "Sin perfil de arquitecto asociado"
              : "Crear requerimiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
