import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";

const DEFAULT_CATEGORIES = [
  "General",
  "Acero",
  "Concreto",
  "Eléctrico",
  "Plomería",
  "Acabados",
  "Herrería",
  "Madera",
  "Impermeabilización",
  "Pintura",
  "Ferretería",
];

const UNITS = ["pza", "kg", "m", "m²", "m³", "lt", "ton", "rollo", "bulto", "saco", "caja", "tramo"];

type Material = {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  category: string;
  description: string | null;
  sku: string | null;
  created_at: string;
};

export default function Materiales() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pza");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");

  const { toast } = useToast();
  const qc = useQueryClient();
  const { companyId, loading: roleLoading } = useViewRole();

  const { data: materials, isLoading } = useQuery({
    queryKey: ["materials", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as Material[];
    },
    enabled: !!companyId && !roleLoading,
  });

  const saveMaterial = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No hay empresa asociada");
      if (editingMaterial) {
        const { error } = await supabase
          .from("materials")
          .update({ name, unit, category, description: description || null, sku: sku || null })
          .eq("id", editingMaterial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materials").insert({
          company_id: companyId,
          name,
          unit,
          category,
          description: description || null,
          sku: sku || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      closeDialog();
      toast({ title: editingMaterial ? "Material actualizado" : "Material agregado" });
    },
    onError: (e: Error) => {
      const msg = e.message.includes("materials_company_name_idx")
        ? "Ya existe un material con ese nombre"
        : e.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Material eliminado" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingMaterial(null);
    setName("");
    setUnit("pza");
    setCategory("General");
    setDescription("");
    setSku("");
  };

  const openEdit = (m: Material) => {
    setEditingMaterial(m);
    setName(m.name);
    setUnit(m.unit);
    setCategory(m.category);
    setDescription(m.description || "");
    setSku(m.sku || "");
    setDialogOpen(true);
  };

  const filtered = materials?.filter((m) => {
    const matchesSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || m.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(materials?.map((m) => m.category) || [])];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Catálogo de Materiales</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Inventario maestro de materiales de tu empresa
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMaterial ? "Editar Material" : "Nuevo Material"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMaterial.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  placeholder="Ej: Varilla corrugada 3/8"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Unidad *</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoría *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input
                  placeholder="Descripción adicional (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>SKU / Código interno</Label>
                <Input
                  placeholder="Ej: CEM-42.5-50KG"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saveMaterial.isPending}>
                {saveMaterial.isPending
                  ? "Guardando..."
                  : editingMaterial
                  ? "Guardar Cambios"
                  : "Agregar Material"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar material..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No company warning */}
      {!companyId && !roleLoading && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No tienes una empresa asociada.</p>
            <p className="text-xs mt-1">
              Asocia tu perfil a una empresa para gestionar el catálogo de materiales.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {companyId && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !filtered?.length ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {searchQuery || filterCategory !== "all"
                    ? "No se encontraron materiales con esos filtros."
                    : "No hay materiales en el catálogo."}
                </p>
                <p className="text-xs mt-1">
                  Agrega materiales para unificar tu inventario maestro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{m.category}</Badge>
                      </TableCell>
                      <TableCell>{m.unit}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {m.sku || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.description || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(m)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMaterial.mutate(m.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            {filtered?.length || 0} material(es) • {categories.length} categoría(s)
          </p>
        </>
      )}
    </div>
  );
}
