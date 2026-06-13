import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Plus,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ShoppingCart,
  Trash2,
  X,
  Search,
  ClipboardList,
} from "lucide-react";
import { useBasket } from "@/contexts/BasketContext";
import { useViewRole } from "@/hooks/useViewRole";

type InventoryItem = {
  id: string;
  material_id: string;
  quantity: number;
  reserved: number;
  min_stock: number;
  location: string | null;
  updated_at: string;
  materials: {
    name: string;
    description: string | null;
    unit: string;
  } | null;
};

type StockStatus = "critical" | "low" | "ok";

const STATUS_CONFIG = {
  critical: {
    color: "#E04444",
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Crítico",
  },
  low: {
    color: "#F59E0B",
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Bajo",
  },
  ok: {
    color: "#10B981",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    label: "Disponible",
  },
} as const;

function getStockStatus(item: {
  quantity: number;
  min_stock: number;
}): StockStatus {
  if (item.min_stock <= 0) return "ok";
  const ratio = item.quantity / item.min_stock;
  if (ratio <= 1.2) return "critical";
  if (ratio <= 2.5) return "low";
  return "ok";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Inventario() {
  const [createOpen, setCreateOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [materialName, setMaterialName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pza");
  const [quantity, setQuantity] = useState("");
  const [minStock, setMinStock] = useState("");
  const [location, setLocation] = useState("");
  const [entryQty, setEntryQty] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [entryType, setEntryType] = useState<"in" | "out">("in");
  const [basketDialogItem, setBasketDialogItem] = useState<InventoryItem | null>(
    null
  );
  const [basketQty, setBasketQty] = useState("1");
  const [basketPanelOpen, setBasketPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "low" | "ok">(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { toast } = useToast();
  const basket = useBasket();
  const { user } = useAuth();
  const { viewRole } = useViewRole();
  const showBasket = viewRole === "compras" || viewRole === "admin";
  const qc = useQueryClient();

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
  const companyId = profile?.company_id;

  const { data: inventory, isLoading } = useQuery({
    queryKey: ["inventory"],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*, materials(name, description, unit)");
      if (error) throw error;
      const items = (data as InventoryItem[]) ?? [];
      return items.sort((a, b) =>
        (a.materials?.name ?? "").localeCompare(b.materials?.name ?? "", "es")
      );
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["inventory-movements", selectedItem?.material_id],
    enabled: !!selectedItem && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, requests:request_id(raw_message)")
        .eq("material_id", selectedItem!.material_id)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: lastEntries } = useQuery({
    queryKey: ["last-entries", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("material_id, created_at")
        .eq("company_id", companyId!)
        .eq("movement_type", "entrada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const m of data ?? []) {
        if (!map.has(m.material_id)) map.set(m.material_id, m.created_at);
      }
      return map;
    },
  });

  const { data: frequentProviders } = useQuery({
    queryKey: ["material-providers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("material_id, purchase_orders(provider_id, providers(name))");
      if (error) throw error;
      const countMap = new Map<
        string,
        Map<string, { name: string; count: number }>
      >();
      for (const item of data ?? []) {
        if (!item.material_id) continue;
        const po = item.purchase_orders as any;
        if (!po?.provider_id || !po?.providers?.name) continue;
        if (!countMap.has(item.material_id))
          countMap.set(item.material_id, new Map());
        const provMap = countMap.get(item.material_id)!;
        const existing = provMap.get(po.provider_id) || {
          name: po.providers.name,
          count: 0,
        };
        existing.count++;
        provMap.set(po.provider_id, existing);
      }
      const result = new Map<string, string>();
      for (const [matId, provMap] of countMap) {
        let best = { name: "", count: 0 };
        for (const prov of provMap.values()) {
          if (prov.count > best.count) best = prov;
        }
        if (best.name) result.set(matId, best.name);
      }
      return result;
    },
  });

  const filteredInventory = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter((item) => {
      const status = getStockStatus(item);
      if (statusFilter === "critical" && status !== "critical") return false;
      if (statusFilter === "low" && status !== "low") return false;
      if (statusFilter === "ok" && status !== "ok") return false;
      const name = item.materials?.name ?? "";
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [inventory, statusFilter, searchQuery]);

  const criticalCount = useMemo(() => {
    return (inventory ?? []).filter(
      (item) => getStockStatus(item) === "critical"
    ).length;
  }, [inventory]);

  const counts = useMemo(() => {
    const c = { all: 0, critical: 0, low: 0, ok: 0 };
    for (const it of inventory ?? []) {
      c.all++;
      c[getStockStatus(it)]++;
    }
    return c;
  }, [inventory]);

  const criticalProviders = useMemo(() => {
    const names = new Set<string>();
    for (const it of inventory ?? []) {
      if (getStockStatus(it) === "critical") {
        const p = frequentProviders?.get(it.material_id);
        if (p) names.add(p);
      }
    }
    return Array.from(names);
  }, [inventory, frequentProviders]);

  const createItem = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Usuario sin empresa asignada");
      if (!materialName.trim()) throw new Error("Nombre del material requerido");

      const { data: mat, error: matErr } = await supabase
        .from("materials")
        .insert({
          company_id: companyId,
          name: materialName.trim(),
          unit,
          description: description.trim() || null,
        })
        .select("id")
        .single();
      if (matErr) throw matErr;

      const { error: invErr } = await supabase.from("inventory").insert({
        company_id: companyId,
        material_id: mat.id,
        quantity: parseFloat(quantity) || 0,
        min_stock: parseFloat(minStock) || 0,
        location: location.trim() || null,
      });
      if (invErr) throw invErr;
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
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !companyId) return;
      const qty = parseFloat(entryQty) || 0;
      if (qty <= 0) throw new Error("Cantidad debe ser mayor a 0");

      const { error: movErr } = await supabase
        .from("inventory_movements")
        .insert({
          company_id: companyId,
          material_id: selectedItem.material_id,
          movement_type: entryType === "in" ? "entrada" : "salida",
          quantity: qty,
          reason: entryNotes.trim() || null,
          created_by: user?.id ?? null,
        });
      if (movErr) throw movErr;

      const newQty =
        entryType === "in"
          ? Number(selectedItem.quantity) + qty
          : Math.max(0, Number(selectedItem.quantity) - qty);

      const { error: upErr } = await supabase
        .from("inventory")
        .update({ quantity: newQty })
        .eq("id", selectedItem.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      qc.invalidateQueries({ queryKey: ["last-entries"] });
      setEntryOpen(false);
      setEntryQty("");
      setEntryNotes("");
      setSelectedItem(null);
      toast({
        title: entryType === "in" ? "Entrada registrada" : "Salida registrada",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEntry = (type: "in" | "out") => {
    setSelectedItem(null);
    setEntryType(type);
    setEntryQty("");
    setEntryNotes("");
    setEntryOpen(true);
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="eyebrow">Stock</span>
          <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">Inventario</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Control de existencias · {inventory?.length ?? 0} material{(inventory?.length ?? 0) !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openEntry("out")}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <ArrowUp className="h-4 w-4" /> Salida
          </button>
          <button
            onClick={() => openEntry("in")}
            className="inline-flex items-center gap-2 rounded-full bg-foreground py-2 pl-5 pr-2 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
          >
            <ArrowDown className="h-4 w-4" /> Entrada de stock
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Plus className="h-4 w-4 mr-1.5" />
                Agregar material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
            <DialogHeader>
              <span className="eyebrow">Inventario</span>
              <DialogTitle>Nuevo material</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createItem.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nombre del material *</Label>
                <Input
                  placeholder="Ej: Cemento Portland"
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input
                  placeholder="Detalle opcional"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Unidad</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "pza",
                        "kg",
                        "ton",
                        "m",
                        "m2",
                        "m3",
                        "lt",
                        "bulto",
                        "saco",
                      ].map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cantidad inicial</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stock mínimo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ubicación / Almacén</Label>
                <Input
                  placeholder="Ej: Bodega Norte"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createItem.isPending || !companyId}
              >
                {createItem.isPending ? "Guardando..." : "Agregar al Inventario"}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Critical alert */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-3.5">
          <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-destructive" />
          <p className="text-sm">
            <strong>{criticalCount} material{criticalCount !== 1 ? "es" : ""}</strong> en estado crítico.
            {criticalProviders.length > 0 &&
              ` Revisá las entradas pendientes con ${criticalProviders.slice(0, 2).join(" y ")}.`}
          </p>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {([
            { key: "all", label: "Todos", n: counts.all },
            { key: "critical", label: "Crítico", n: counts.critical },
            { key: "low", label: "Bajo", n: counts.low },
            { key: "ok", label: "Disponible", n: counts.ok },
          ] as const).map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {f.label} · {String(f.n).padStart(2, "0")}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar material..."
            className="w-64 rounded-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Inventory grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filteredInventory.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">
              {inventory?.length
                ? "No hay materiales que coincidan con el filtro."
                : "No hay materiales en inventario."}
            </p>
            {!inventory?.length && (
              <p className="text-xs mt-1">
                Agrega materiales para comenzar a llevar el control de
                existencias.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInventory.map((item) => {
            const qty = Number(item.quantity);
            const reserved = Number(item.reserved);
            const available = qty - reserved;
            const min = Number(item.min_stock);
            const status = getStockStatus(item);
            const cfg = STATUS_CONFIG[status];

            const barMax = Math.max(qty, min * 1.2, 1);
            const reservedPct = (reserved / barMax) * 100;
            const availablePct = (available / barMax) * 100;
            const minLinePct = min > 0 ? (min / barMax) * 100 : 0;

            const lastEntry = lastEntries?.get(item.material_id);
            const provider = frequentProviders?.get(item.material_id);
            const unit = item.materials?.unit ?? "";

            const metaParts: string[] = [];
            if (provider) metaParts.push(provider);
            if (lastEntry) metaParts.push(`entrada ${new Date(lastEntry).toLocaleDateString("es-AR")}`);
            const meta = metaParts.join(" · ") || "Sin movimientos";

            return (
              <Card key={item.id} className="rounded-2xl border-border/70 shadow-soft transition-shadow hover:shadow-card">
                <CardContent className="grid items-center gap-5 p-5 md:grid-cols-[6px_1.6fr_170px_1fr_260px]">
                  {/* Strip */}
                  <div className="h-12 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />

                  {/* Material */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{capitalize(item.materials?.name ?? "")}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {meta}
                    </div>
                  </div>

                  {/* Stock total / disponible */}
                  <div>
                    <div className="mb-0.5 text-[11px] text-muted-foreground/80">Stock total / disponible</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl font-semibold">{available.toLocaleString("es-AR")}</span>
                      <span className="font-mono text-xs text-muted-foreground">/ {qty.toLocaleString("es-AR")} {unit}</span>
                    </div>
                  </div>

                  {/* Bar */}
                  <div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                      {reserved > 0 && (
                        <div className="absolute left-0 top-0 h-full" style={{ width: `${reservedPct}%`, backgroundColor: "#FBBF24" }} />
                      )}
                      <div className="absolute top-0 h-full" style={{ left: `${reservedPct}%`, width: `${availablePct}%`, backgroundColor: cfg.color }} />
                      {min > 0 && (
                        <div className="absolute top-[-3px] h-[14px] w-0.5" style={{ left: `${Math.min(minLinePct, 100)}%`, backgroundColor: "#E04444", opacity: 0.7 }} />
                      )}
                    </div>
                    <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>reservado {reserved}</span>
                      <span>disponible {available}</span>
                      <span>mín {min}</span>
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-3 justify-self-end">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider"
                      style={{ color: cfg.color, borderColor: cfg.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        title="Entrada"
                        onClick={() => { setSelectedItem(item); setEntryType("in"); setEntryOpen(true); }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 border-red-300 text-red-600 hover:bg-red-50"
                        title="Salida"
                        onClick={() => { setSelectedItem(item); setEntryType("out"); setEntryOpen(true); }}
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0"
                        title="Movimientos"
                        onClick={() => setSelectedItem(item)}
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                      {showBasket && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0"
                          title="Agregar a cesta"
                          onClick={() => { setBasketDialogItem(item); setBasketQty("1"); }}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Movement entry dialog */}
      <Dialog
        open={entryOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEntryOpen(false);
            setSelectedItem(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <span className="eyebrow">{entryType === "in" ? "Registrar entrada" : "Registrar salida"}</span>
            <DialogTitle>{selectedItem?.materials?.name ?? "Seleccioná un material"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addMovement.mutate();
            }}
            className="space-y-4"
          >
            {!selectedItem && (
              <div className="space-y-2">
                <Label>Material</Label>
                <Select
                  value=""
                  onValueChange={(v) =>
                    setSelectedItem(inventory?.find((i) => i.id === v) ?? null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar material..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory?.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.materials?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Cantidad ({selectedItem?.materials?.unit ?? "—"})</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                value={entryQty}
                onChange={(e) => setEntryQty(e.target.value)}
                disabled={!selectedItem}
                required
              />
              {entryType === "out" && selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Disponible:{" "}
                  {Number(selectedItem.quantity) - Number(selectedItem.reserved)}{" "}
                  {selectedItem.materials?.unit}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                placeholder="Motivo o referencia"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={addMovement.isPending || !selectedItem}
            >
              {addMovement.isPending
                ? "Registrando..."
                : entryType === "in"
                  ? "Registrar Entrada"
                  : "Registrar Salida"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Basket quantity dialog */}
      <Dialog
        open={!!basketDialogItem}
        onOpenChange={(o) => {
          if (!o) setBasketDialogItem(null);
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <span className="eyebrow">Cesta de cotización</span>
            <DialogTitle>Agregar a cesta</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">
            {basketDialogItem?.materials?.name}
          </p>
          <p className="text-xs text-muted-foreground">
            Stock: {Number(basketDialogItem?.quantity || 0)}{" "}
            {basketDialogItem?.materials?.unit}
          </p>
          <div className="space-y-2">
            <Label>Cantidad ({basketDialogItem?.materials?.unit})</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={basketQty}
              onChange={(e) => setBasketQty(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => {
              if (!basketDialogItem?.materials) return;
              const qty = parseFloat(basketQty) || 0;
              if (qty <= 0) return;
              basket.addItem(
                {
                  material_id: basketDialogItem.material_id,
                  name: basketDialogItem.materials.name,
                  unit: basketDialogItem.materials.unit,
                },
                qty
              );
              toast({
                title: `${basketDialogItem.materials.name} agregado a la cesta`,
              });
              setBasketDialogItem(null);
            }}
          >
            Agregar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Floating basket indicator */}
      {showBasket && basket.totalItems > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            size="lg"
            className="rounded-full shadow-lg h-14 w-14 relative"
            onClick={() => setBasketPanelOpen(!basketPanelOpen)}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {basket.totalItems}
            </span>
          </Button>

          {basketPanelOpen && (
            <div className="absolute bottom-16 right-0 w-72 bg-background border rounded-lg shadow-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Cesta de cotización</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBasketPanelOpen(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {basket.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => basket.removeItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="w-full text-xs"
                onClick={() => {
                  basket.clear();
                  setBasketPanelOpen(false);
                }}
              >
                Vaciar cesta
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Generá la solicitud desde la sección Solicitudes
              </p>
            </div>
          )}
        </div>
      )}

      {/* Movements history dialog */}
      <Dialog
        open={!!selectedItem && !entryOpen}
        onOpenChange={(o) => {
          if (!o) setSelectedItem(null);
        }}
      >
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <span className="eyebrow">Movimientos</span>
            <DialogTitle>{selectedItem?.materials?.name}</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-1 mb-3">
            <p>
              Stock actual:{" "}
              <span className="font-bold">
                {Number(selectedItem?.quantity || 0)}{" "}
                {selectedItem?.materials?.unit}
              </span>
            </p>
          </div>
          {!movements?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin movimientos registrados.
            </p>
          ) : (
            <div className="space-y-2">
              {movements.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {m.movement_type === "entrada" ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {m.movement_type === "entrada" ? "+" : "-"}
                        {Number(m.quantity)} {selectedItem?.materials?.unit}
                      </p>
                      {m.reason && (
                        <p className="text-xs text-muted-foreground">
                          {m.reason}
                        </p>
                      )}
                      {m.requests?.raw_message && (
                        <p className="text-xs text-primary">
                          Pedido: {m.requests.raw_message.slice(0, 40)}...
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("es-AR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
