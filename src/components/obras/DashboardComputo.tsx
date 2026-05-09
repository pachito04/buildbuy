import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileSpreadsheet, Download, Upload, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/computo-utils";
import { ComputoUploader, type ParsedRow } from "./ComputoUploader";
import { MatchTable } from "./MatchTable";

interface DashboardComputoProps {
  projectId: string;
  computo: {
    id: string;
    version: number;
    archivo_origen: string | null;
    archivo_url: string | null;
    total_estimado: number;
    created_at: string;
    items: Array<{
      id: string;
      rubro: string;
      descripcion_origen: string;
      material_id: string | null;
      unidad: string;
      cantidad_estimada: number;
      precio_unit_estimado: number;
      subtotal_estimado: number;
      materials: { name: string; unit: string } | null;
    }>;
  } | null;
  onComputoSaved: () => void;
}

type UploadStep = "idle" | "parsed" | "matching";

export function DashboardComputo({ projectId, computo, onComputoSaved }: DashboardComputoProps) {
  const { companyId } = useViewRole();
  const [showUploader, setShowUploader] = useState(!computo);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parsedFile, setParsedFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<any[]>([]);

  const { data: materials = [] } = useQuery({
    queryKey: ["materials-catalog", companyId],
    enabled: !!companyId && showUploader,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, name, unit")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleParsed = async (rows: ParsedRow[], file: File) => {
    setParsedRows(rows);
    setParsedFile(file);

    if (!companyId) return;

    const descriptions = rows.map((r) => r.descripcion);
    const { data, error } = await supabase.rpc("match_materials", {
      p_company_id: companyId,
      p_descriptions: descriptions,
    });

    setMatches(error ? [] : (data ?? []));
    setUploadStep("parsed");
  };

  const handleDone = () => {
    setShowUploader(false);
    setUploadStep("idle");
    setParsedRows([]);
    setParsedFile(null);
    setMatches([]);
    onComputoSaved();
  };

  if (showUploader && uploadStep === "parsed" && parsedFile) {
    return (
      <MatchTable
        parsedRows={parsedRows}
        file={parsedFile}
        projectId={projectId}
        materials={materials}
        matches={matches}
        onDone={handleDone}
        onBack={() => {
          setUploadStep("idle");
          setParsedRows([]);
          setParsedFile(null);
        }}
      />
    );
  }

  if (showUploader || !computo) {
    return (
      <div className="space-y-4">
        {computo && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowUploader(false)}>
              Cancelar
            </Button>
          </div>
        )}
        <ComputoUploader onParsed={handleParsed} />
      </div>
    );
  }

  const rubros = [...new Set(computo.items.map((i) => i.rubro))];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{computo.archivo_origen ?? "Archivo"}</span>
            <Badge variant="secondary" className="text-xs">v{computo.version}</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(computo.created_at).toLocaleDateString("es-AR")}
            </span>
            <span>{computo.items.length} ítems</span>
            <span>Total: {formatCurrency(computo.total_estimado)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {computo.archivo_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={computo.archivo_url} download>
                <Download className="h-4 w-4 mr-1" />
                Descargar
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowUploader(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Nueva versión
          </Button>
        </div>
      </div>

      <Separator />

      {rubros.map((rubro) => {
        const rubroItems = computo.items.filter((i) => i.rubro === rubro);
        return (
          <div key={rubro}>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">{rubro}</h4>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-xs">Descripción</th>
                      <th className="text-left px-3 py-1.5 text-xs">Material</th>
                      <th className="text-right px-3 py-1.5 text-xs">Cant.</th>
                      <th className="text-left px-3 py-1.5 text-xs">Ud.</th>
                      <th className="text-right px-3 py-1.5 text-xs">P. Unit.</th>
                      <th className="text-right px-3 py-1.5 text-xs">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubroItems.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-1.5 text-xs">{item.descripcion_origen}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {item.materials?.name ?? (
                            <span className="text-muted-foreground italic">Sin match</span>
                          )}
                        </td>
                        <td className="text-right px-3 py-1.5 text-xs font-mono">
                          {item.cantidad_estimada}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{item.unidad}</td>
                        <td className="text-right px-3 py-1.5 text-xs font-mono">
                          {formatCurrency(item.precio_unit_estimado)}
                        </td>
                        <td className="text-right px-3 py-1.5 text-xs font-mono font-medium">
                          {formatCurrency(item.subtotal_estimado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
