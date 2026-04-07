import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldAlert, Link2, Copy, Check, Plus } from "lucide-react";

type AppRole = "arquitecto" | "compras" | "proveedor" | "admin";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  role: AppRole | null;
  role_row_id: string | null;
}

interface InviteCode {
  id: string;
  code: string;
  role: AppRole;
  expires_at: string;
  active: boolean;
  used_by: string | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  arquitecto: "Arquitecto",
  compras: "Compras",
  proveedor: "Proveedor",
  admin: "Administrador",
};

const ROLE_COLORS: Record<AppRole, string> = {
  arquitecto: "bg-blue-100 text-blue-800 border-blue-200",
  compras: "bg-emerald-100 text-emerald-800 border-emerald-200",
  proveedor: "bg-violet-100 text-violet-800 border-violet-200",
  admin: "bg-orange-100 text-orange-800 border-orange-200",
};

function getInitials(name: string | null, email: string | null) {
  if (name) return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (email?.[0] ?? "?").toUpperCase();
}

function RoleBadge({ role }: { role: AppRole | null }) {
  if (!role) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-500 border-zinc-200">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Sin rol
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {ROLE_LABELS[role]}
    </span>
  );
}

export default function Usuarios() {
  const { actualRole } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<AppRole>("arquitecto");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  // ── Fetch users ──────────────────────────────────────────────────
  const { data: users, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("id, user_id, role");

      const roleMap = new Map(
        (roles ?? []).map((r) => [r.user_id, { role: r.role as AppRole, id: r.id }])
      );

      return (profiles ?? []).map((p): UserRow => ({
        ...p,
        role: roleMap.get(p.id)?.role ?? null,
        role_row_id: roleMap.get(p.id)?.id ?? null,
      }));
    },
  });

  // ── Fetch active invite codes ────────────────────────────────────
  const { data: inviteCodes } = useQuery({
    queryKey: ["invite-codes"],
    enabled: actualRole === "admin",
    queryFn: async () => {
      const { data } = await supabase
        .from("invite_codes")
        .select("id, code, role, expires_at, active, used_by")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as InviteCode[];
    },
  });

  // ── Assign role mutation ─────────────────────────────────────────
  const assignRole = useMutation({
    mutationFn: async ({ userId, role, existingRoleId }: { userId: string; role: AppRole | "none"; existingRoleId: string | null }) => {
      if (role === "none") {
        if (existingRoleId) {
          const { error } = await supabase.from("user_roles").delete().eq("id", existingRoleId);
          if (error) throw error;
        }
        return;
      }
      if (existingRoleId) {
        const { error } = await supabase.from("user_roles").update({ role }).eq("id", existingRoleId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({
        title: "Rol actualizado",
        description: vars.role === "none" ? "Rol eliminado." : `Rol asignado: ${ROLE_LABELS[vars.role as AppRole]}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setUpdatingId(null),
  });

  const handleRoleChange = (u: UserRow, newRole: string) => {
    setUpdatingId(u.id);
    assignRole.mutate({ userId: u.id, role: newRole as AppRole | "none", existingRoleId: u.role_row_id });
  };

  // ── Generate invite code ─────────────────────────────────────────
  const handleGenerateCode = async () => {
    if (!user) return;
    setGeneratingCode(true);

    // Get company from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      toast({ title: "Sin empresa", description: "No tenés empresa asignada.", variant: "destructive" });
      setGeneratingCode(false);
      return;
    }

    const { data, error } = await supabase
      .from("invite_codes")
      .insert({ company_id: profile.company_id, role: inviteRole, created_by: user.id })
      .select("code")
      .single();

    if (error || !data) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
      setGeneratingCode(false);
      return;
    }

    setGeneratedCode(data.code);
    qc.invalidateQueries({ queryKey: ["invite-codes"] });
    setGeneratingCode(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Access guard ─────────────────────────────────────────────────
  if (actualRole !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-muted-foreground text-sm mt-1">Solo los administradores pueden ver esta sección.</p>
      </div>
    );
  }

  const displayUsers = users ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Usuarios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gestioná los miembros de tu organización y sus roles</p>
        </div>
        <Button onClick={() => { setInviteOpen(true); setGeneratedCode(null); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Invitar usuario
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: displayUsers.length },
          { label: "Con rol", value: displayUsers.filter((u) => u.role).length },
          { label: "Sin rol", value: displayUsers.filter((u) => !u.role).length },
          { label: "Admins", value: displayUsers.filter((u) => u.role === "admin").length },
        ].map(({ label, value }) => (
          <Card key={label} className="border-0 shadow-sm bg-muted/40">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active invite codes */}
      {inviteCodes && inviteCodes.length > 0 && (
        <Card className="shadow-sm border-dashed">
          <CardHeader className="px-6 py-4 border-b bg-muted/10">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Códigos de invitación activos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {inviteCodes.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm font-bold tracking-widest bg-muted px-2 py-0.5 rounded">
                      {inv.code}
                    </code>
                    <RoleBadge role={inv.role} />
                    <span className="text-xs text-muted-foreground">
                      Expira {new Date(inv.expires_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyCode(inv.code)} className="gap-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="px-6 py-4 border-b bg-muted/20">
          <CardTitle className="text-base font-semibold">Miembros de la organización</CardTitle>
          <CardDescription className="text-xs">Asigná roles para controlar el acceso de cada usuario</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-36" />
                </div>
              ))}
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Sin usuarios aún</p>
              <p className="text-xs text-muted-foreground mt-1">Invitá usuarios con el botón de arriba.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6 text-xs font-medium text-muted-foreground">Usuario</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Email</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Rol actual</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Asignar rol</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground pr-6">Desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                            {getInitials(u.full_name, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{u.full_name ?? "Sin nombre"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{u.email ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role ?? "none"}
                        onValueChange={(v) => handleRoleChange(u, v)}
                        disabled={updatingId === u.id}
                      >
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                          <SelectValue placeholder="Asignar rol..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none"><span className="text-muted-foreground">Sin rol</span></SelectItem>
                          <SelectItem value="arquitecto">Arquitecto</SelectItem>
                          <SelectItem value="compras">Compras</SelectItem>
                          <SelectItem value="proveedor">Proveedor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-6">
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Invitar usuario</DialogTitle>
            <DialogDescription>
              Generá un código de invitación. El usuario lo ingresa al registrarse y queda vinculado a tu empresa con el rol que elijas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rol del invitado</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arquitecto">Arquitecto — carga requerimientos</SelectItem>
                  <SelectItem value="compras">Compras — gestiona pedidos y OCs</SelectItem>
                  <SelectItem value="proveedor">Proveedor — cotiza órdenes</SelectItem>
                  <SelectItem value="admin">Administrador — acceso completo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!generatedCode ? (
              <Button onClick={handleGenerateCode} disabled={generatingCode} className="w-full gap-2">
                {generatingCode ? "Generando..." : <><Link2 className="h-4 w-4" />Generar código</>}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3">
                  <code className="flex-1 font-mono text-2xl font-bold tracking-[0.3em] text-center">
                    {generatedCode}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyCode(generatedCode)}
                    className="gap-1.5 shrink-0"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Este código expira en 7 días y es de un solo uso. El usuario lo ingresa en la pantalla de onboarding.
                </p>
                <Button variant="outline" onClick={handleGenerateCode} className="w-full text-sm">
                  Generar otro código
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
