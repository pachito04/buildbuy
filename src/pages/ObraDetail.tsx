import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComputo } from "@/hooks/useComputo";
import { useObraDashboard } from "@/hooks/useObraDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, User } from "lucide-react";
import { DashboardResumen } from "@/components/obras/DashboardResumen";
import { DashboardMateriales } from "@/components/obras/DashboardMateriales";
import { DashboardComputo } from "@/components/obras/DashboardComputo";

export default function ObraDetail() {
  const { obraId } = useParams<{ obraId: string }>();

  const { data: obra, isLoading: obraLoading } = useQuery({
    queryKey: ["obra-detail", obraId],
    enabled: !!obraId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", obraId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: computo, isLoading: computoLoading, refetch: refetchComputo } = useComputo(obraId);
  const { data: dashboard, isLoading: dashboardLoading } = useObraDashboard(obraId);

  if (obraLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Obra no encontrada.</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/obras">Volver a Obras</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-0.5">
          <Link to="/obras">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold">{obra.name}</h1>
            {obra.code && (
              <Badge variant="outline" className="text-xs font-mono">
                {obra.code}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            {(obra.address || obra.city || obra.province) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {[obra.address, obra.city, obra.province].filter(Boolean).join(", ")}
              </span>
            )}
            {obra.contact_name && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                {obra.contact_name}
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="requerimientos">Requerimientos</TabsTrigger>
          <TabsTrigger value="computo">Cómputo</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          {dashboardLoading ? (
            <LoadingSpinner />
          ) : !dashboard?.hasComputo ? (
            <EmptyComputoMessage obraId={obraId!} />
          ) : (
            <DashboardResumen
              kpis={dashboard.kpis}
              rubros={dashboard.rubros}
              sinPrecios={dashboard.sinPrecios}
            />
          )}
        </TabsContent>

        <TabsContent value="materiales" className="mt-4">
          {dashboardLoading ? (
            <LoadingSpinner />
          ) : !dashboard?.hasComputo ? (
            <EmptyComputoMessage obraId={obraId!} />
          ) : (
            <DashboardMateriales items={dashboard.items} />
          )}
        </TabsContent>

        <TabsContent value="requerimientos" className="mt-4">
          <div className="text-center py-8">
            <Button variant="outline" asChild>
              <Link to={`/obras/${obraId}/requerimientos`}>
                Ver requerimientos de esta obra
              </Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="computo" className="mt-4">
          {computoLoading ? (
            <LoadingSpinner />
          ) : (
            <DashboardComputo
              projectId={obraId!}
              computo={computo ?? null}
              onComputoSaved={() => refetchComputo()}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function EmptyComputoMessage({ obraId }: { obraId: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-sm">No hay cómputo cargado para esta obra.</p>
      <p className="text-xs mt-1">
        Subí un archivo de cómputo en la pestaña{" "}
        <span className="font-medium text-foreground">Cómputo</span> para ver el dashboard.
      </p>
    </div>
  );
}
