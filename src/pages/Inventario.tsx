import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Package, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";

export default function Inventario() {
  const [createOpen, setCreateOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [materialName, setMaterialName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pza");
  const [quantity, setQuantity] = useState("");
  const [minStock, setMinStock] = useState("");
  const [location, setLocation] = useState("");
  const [entryQty, setEntryQty] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [entryType, setEntryType] = useState<"in" | "out">("in");

  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: inventory, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("material_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["inventory-movements", selectedItem?.id],
    enabled: !!selectedItem,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, requests:request_id(raw_message)")
        .eq("inventory_id", selectedItem.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const createItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory").insert({
        material_name: materialName,
        description: description || null,
        unit,
        quantity: parseFloat(quantity) || 0,
        min_stock: parseFloat(minStock) || 0,
        location: location || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setCreateOpen(false);
      setMaterialName("");
      setDescription("");
      setUnit("pza");
      setQuantity("");
      setMinStock("");
      setLocation("");
      toast({ title: "Material agregado al inventario" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      if (!selectedItem) return;
      const qty = parseFloat(entryQty) || 0;
      if (qty <= 0) throw new Error("Cantidad debe ser mayor a 0");

      // Insert movement
      const { error: movErr } = await supabase.from("inventory_movements").insert({
        inventory_id: selectedItem.id,
        movement_type: entryType,
        quantity: qty,
        notes: entryNotes || null,
        created_by: user?.id,
      } as any);
      if (movErr) throw movErr;

      // Update inventory quantity
      const newQty = entryType === "in"
        ? (Number(selectedItem.quantity) + qty)
        : Math.max(0, Number(selectedItem.quantity) - qty);

      const { error: upErr } = await supabase
        .from("inventory")
        .update({ quantity: newQty, updated_at: new Date().toISOString() } as any)
        .eq("id", selectedItem.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      setEntryOpen(false);
      setEntryQty("");
      setEntryNotes("");
      setSelectedItem(null);
      toast({ title: entryType === "in" ? "Entrada registrada" : "Salida registrada" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const lowStockItems = (inventory || []).filter(
    (i: any) => Number(i.quantity) <= Number(i.min_stock) && Number(i.min_stock) > 0
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Inventario</h1>
          <p className="text-muted-foreground text-sm mt-1">Control de existencias de materiales</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Agregar Material</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Material en Inventario</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createItem.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre del material *</Label>
                <Input placeholder="Ej: Cemento Portland" value={materialName} onChange={(e) => setMaterialName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input placeholder="Detalle opcional" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Unidad</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pza", "kg", "ton", "m", "m2", "m3", "lt", "bulto", "saco"].map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cantidad inicial</Label>
                  <Input type="number" step="0.01" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Stock mínimo</Label>
                  <Input type="number" step="0.01" placeholder="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ubicación / Almacén</Label>
                <Input placeholder="Ej: Bodega Norte" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createItem.isPending}>
                {createItem.isPending ? "Guardando..." : "Agregar al Inventario"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Stock bajo ({lowStockItems.length} materiales)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((item: any) => (
                <Badge key={item.id} variant="outline" className="text-xs">
                  {item.material_name}: {Number(item.quantity)} {item.unit}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !inventory?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">No hay materiales en inventario.</p>
            <p className="text-xs mt-1">Agrega materiales para comenzar a llevar el control de existencias.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.map((item: any) => {
            const isLow = Number(item.quantity) <= Number(item.min_stock) && Number(item.min_stock) > 0;
            return (
              <Card key={item.id} className={isLow ? "border-warning/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-display">{item.material_name}</CardTitle>
                    {isLow && <AlertTriangle className="h-4 w-4 text-warning" />}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-display">{Number(item.quantity).toLocaleString("es-MX")}</span>
                    <span className="text-sm text-muted-foreground">{item.unit}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {Number(item.min_stock) > 0 && <span>Mín: {Number(item.min_stock)} {item.unit}</span>}
                    {item.location && <span>📍 {item.location}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSelectedItem(item); setEntryType("in"); setEntryOpen(true); }}
                    >
                      <ArrowDownCircle className="h-3 w-3 mr-1 text-green-600" />Entrada
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSelectedItem(item); setEntryType("out"); setEntryOpen(true); }}
                    >
                      <ArrowUpCircle className="h-3 w-3 mr-1 text-red-500" />Salida
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => { setSelectedItem(item); }}
                  >
                    Ver movimientos
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Movement entry dialog */}
      <Dialog open={entryOpen} onOpenChange={(o) => { if (!o) { setEntryOpen(false); setSelectedItem(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {entryType === "in" ? "Registrar Entrada" : "Registrar Salida"} — {selectedItem?.material_name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addMovement.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Cantidad ({selectedItem?.unit})</Label>
              <Input type="number" step="0.01" placeholder="0" value={entryQty} onChange={(e) => setEntryQty(e.target.value)} required />
              {entryType === "out" && selectedItem && (
                <p className="text-xs text-muted-foreground">Disponible: {Number(selectedItem.quantity)} {selectedItem.unit}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input placeholder="Motivo o referencia" value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={addMovement.isPending}>
              {addMovement.isPending ? "Registrando..." : entryType === "in" ? "Registrar Entrada" : "Registrar Salida"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Movements history dialog */}
      <Dialog open={!!selectedItem && !entryOpen} onOpenChange={(o) => { if (!o) setSelectedItem(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Movimientos — {selectedItem?.material_name}</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-1 mb-3">
            <p>Stock actual: <span className="font-bold">{Number(selectedItem?.quantity || 0)} {selectedItem?.unit}</span></p>
          </div>
          {!movements?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin movimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {movements.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    {m.movement_type === "in" ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {m.movement_type === "in" ? "+" : "-"}{Number(m.quantity)} {selectedItem?.unit}
                      </p>
                      {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                      {m.requests?.raw_message && (
                        <p className="text-xs text-primary">Pedido: {m.requests.raw_message.slice(0, 40)}...</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString("es-MX")}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
