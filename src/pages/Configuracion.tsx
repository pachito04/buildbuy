import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Settings, Save, ShoppingBasket, DollarSign } from "lucide-react";
import { PoolEmpresasPanel } from "@/components/configuracion/PoolEmpresasPanel";
import { PoolMateriasPanel } from "@/components/configuracion/PoolMateriasPanel";

export default function Configuracion() {
  const { actualRole, companyId } = useViewRole();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company-settings", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [thresholdDays, setThresholdDays] = useState<string>("7");
  const [saldoLimite, setSaldoLimite] = useState<string>("");

  useEffect(() => {
    if (settings?.urgente_threshold_days != null) {
      setThresholdDays(String(settings.urgente_threshold_days));
    }
    if (settings?.saldo_limite_proveedor != null) {
      setSaldoLimite(String(settings.saldo_limite_proveedor));
    } else {
      setSaldoLimite("");
    }
  }, [settings?.urgente_threshold_days, settings?.saldo_limite_proveedor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sin empresa asignada");
      const value = parseInt(thresholdDays, 10);
      if (isNaN(value) || value < 1) throw new Error("El umbral debe ser al menos 1 día");

      const limiteRaw = saldoLimite.trim();
      const limiteValue = limiteRaw === "" ? null : parseFloat(limiteRaw);
      if (limiteValue !== null && (isNaN(limiteValue) || limiteValue < 0)) {
        throw new Error("El límite de saldo debe ser un número positivo o dejarse vacío (sin límite).");
      }

      if (settings?.id) {
        const { error } = await supabase
          .from("company_settings")
          .update({ urgente_threshold_days: value, saldo_limite_proveedor: limiteValue })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ company_id: companyId, urgente_threshold_days: value, saldo_limite_proveedor: limiteValue });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      qc.invalidateQueries({ queryKey: ["urgency-threshold"] });
      toast.success("Configuración guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (actualRole !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-muted-foreground text-sm mt-1">
          Solo los administradores pueden ver esta sección.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1
          className="font-bold text-2xl tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Configuración
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Parámetros generales de la empresa
        </p>
      </div>

      <Card className="shadow-sm max-w-lg">
        <CardHeader className="px-6 py-4 border-b bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Requerimientos
          </CardTitle>
          <CardDescription className="text-xs">
            Configurá cómo se clasifican los requerimientos urgentes
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="threshold">Umbral de urgencia (días)</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  max={90}
                  value={thresholdDays}
                  onChange={(e) => setThresholdDays(e.target.value)}
                  className="max-w-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Un requerimiento se marca como <strong>urgente</strong> cuando
                  faltan {thresholdDays || "…"} días o menos para la fecha de
                  entrega deseada.
                </p>
              </div>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Cuenta Corriente — límite de saldo por proveedor                    */}
      {/* ------------------------------------------------------------------ */}
      <Card className="shadow-sm max-w-lg">
        <CardHeader className="px-6 py-4 border-b bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Cuenta Corriente
          </CardTitle>
          <CardDescription className="text-xs">
            Configurá alertas de saldo para proveedores
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="saldo-limite">Límite de saldo por proveedor (ARS)</Label>
                <Input
                  id="saldo-limite"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Sin límite"
                  value={saldoLimite}
                  onChange={(e) => setSaldoLimite(e.target.value)}
                  className="max-w-[180px]"
                />
                <p className="text-xs text-muted-foreground">
                  El dashboard alertará cuando el saldo neto de un proveedor supere este monto.
                  Dejá vacío para desactivar la alerta.
                </p>
              </div>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Pool de Compras — admin-only                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h2
          className="font-semibold text-lg tracking-tight flex items-center gap-2 mb-4"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <ShoppingBasket className="h-5 w-5 text-primary" />
          Pool de Compras
        </h2>
        <div className="space-y-4 max-w-2xl">
          <PoolEmpresasPanel />
          <PoolMateriasPanel />
        </div>
      </div>
    </div>
  );
}
