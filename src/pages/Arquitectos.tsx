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
import { Plus, Pencil, Trash2, HardHat, Search, Link2, LinkIcon } from "lucide-react";

type Architect = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  created_at: string;
};

type ArchitectUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export default function Arquitectos() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Architect | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Linking state
  const [linkingArchitectId, setLinkingArchitectId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const { toast } = useToast();
  const qc = useQueryClient();

  const { companyId, actualRole, loading: roleLoading } = useViewRole();
  const isAdmin = actualRole === "admin";

  const { data: architects, isLoading } = useQuery({
    queryKey: ["architects", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("architects")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as Architect[];
    },
    enabled: !!companyId && !roleLoading,
  });

  // Load users with arquitecto role (for linking) — admin only
  const { data: arquitectoUsers } = useQuery({
    queryKey: ["arquitecto-users", companyId],
    enabled: isAdmin && !!companyId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "arquitecto");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
        .eq("company_id", companyId!);
      return (profiles ?? []) as ArchitectUser[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No hay empresa asociada");
      if (editing) {
        const { error } = await supabase
          .from("architects")
          .update({ full_name: fullName, email: email || null, phone: phone || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("architects").insert({
          company_id: companyId,
          full_name: fullName,
          email: email || null,
          phone: phone || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      closeDialog();
      toast({ title: editing ? "Arquitecto actualizado" : "Arquitecto agregado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("architects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      toast({ title: "Arquitecto eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const linkUser = useMutation({
    mutationFn: async ({ architectId, userId }: { architectId: string; userId: string }) => {
      // Unlink any previous architect linked to this user
      const { error: unlinkErr } = await supabase
        .from("architects")
        .update({ user_id: null })
        .eq("user_id", userId)
        .neq("id", architectId);
      if (unlinkErr) throw unlinkErr;

      const { error } = await supabase
        .from("architects")
        .update({ user_id: userId })
        .eq("id", architectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      qc.invalidateQueries({ queryKey: ["arquitecto-users"] });
      setLinkingArchitectId(null);
      setSelectedUserId("");
      toast({ title: "Usuario vinculado", description: "El arquitecto puede ahora generar pedidos con su cuenta." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkUser = useMutation({
    mutationFn: async (architectId: string) => {
      const { error } = await supabase
        .from("architects")
        .update({ user_id: null })
        .eq("id", architectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      toast({ title: "Usuario desvinculado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setFullName("");
    setEmail("");
    setPhone("");
  };

  const openEdit = (a: Architect) => {
    setEditing(a);
    setFullName(a.full_name);
    setEmail(a.email || "");
    setPhone(a.phone || "");
    setDialogOpen(true);
  };

  const filtered = architects?.filter(
    (a) =>
      !searchQuery ||
      a.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Map user_id → profile for display
  const userMap: Record<string, ArchitectUser> = {};
  arquitectoUsers?.forEach((u) => { userMap[u.id] = u; });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Arquitectos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Arquitectos asociados a tus proyectos de obra
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Agregar Arquitecto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Arquitecto" : "Nuevo Arquitecto"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input placeholder="Ej: Arq. Juan Pérez" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input placeholder="+54 11 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={save.isPending}>
                {save.isPending ? "Guardando..." : editing ? "Guardar Cambios" : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar arquitecto..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {isAdmin && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LinkIcon className="h-3 w-3" />
          Vinculá cada arquitecto a su cuenta de usuario para que puedan generar pedidos.
        </p>
      )}

      {!companyId && !roleLoading && (
        <Card><CardContent className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No tienes una empresa asociada.</p>
        </CardContent></Card>
      )}

      {companyId && (
        <>
          {(isLoading || roleLoading) ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : !filtered?.length ? (
            <Card><CardContent className="text-center py-12 text-muted-foreground">
              <HardHat className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No hay arquitectos registrados.</p>
              <p className="text-xs mt-1">Agrega arquitectos para asociarlos a proyectos y pedidos.</p>
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    {isAdmin && <TableHead>Usuario vinculado</TableHead>}
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const linkedUser = a.user_id ? userMap[a.user_id] : null;
                    const isLinking = linkingArchitectId === a.id;

                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{a.phone || "—"}</TableCell>

                        {isAdmin && (
                          <TableCell>
                            {isLinking ? (
                              // Inline linking UI
                              <div className="flex items-center gap-2">
                                <Select
                                  value={selectedUserId}
                                  onValueChange={setSelectedUserId}
                                >
                                  <SelectTrigger className="w-40 h-7 text-xs">
                                    <SelectValue placeholder="Seleccionar..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {arquitectoUsers?.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {u.full_name ?? u.email ?? u.id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  disabled={!selectedUserId || linkUser.isPending}
                                  onClick={() =>
                                    linkUser.mutate({ architectId: a.id, userId: selectedUserId })
                                  }
                                >
                                  Vincular
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  onClick={() => {
                                    setLinkingArchitectId(null);
                                    setSelectedUserId("");
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : linkedUser ? (
                              // Linked — show name + unlink option
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {linkedUser.full_name ?? linkedUser.email}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs px-1.5 text-muted-foreground"
                                  onClick={() => unlinkUser.mutate(a.id)}
                                >
                                  Desvincular
                                </Button>
                              </div>
                            ) : (
                              // Not linked
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setLinkingArchitectId(a.id);
                                  setSelectedUserId(a.user_id ?? "");
                                }}
                              >
                                <Link2 className="h-3 w-3" />
                                Vincular usuario
                              </Button>
                            )}
                          </TableCell>
                        )}

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">{filtered?.length || 0} arquitecto(s)</p>
        </>
      )}
    </div>
  );
}
