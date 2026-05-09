import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ParsedRow {
  rubro: string;
  descripcion: string;
  unidad: string;
  cantidad: number | null;
  precio_unitario: number | null;
  subtotal: number | null;
}

interface ComputoUploaderProps {
  onParsed: (rows: ParsedRow[], file: File) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const COLUMN_ALIASES: Record<string, string[]> = {
  rubro: ["rubro", "categoria", "categoría", "rub", "grupo", "capitulo", "capítulo"],
  descripcion: ["descripcion", "descripción", "material", "detalle", "item", "ítem", "concepto", "nombre"],
  unidad: ["unidad", "ud", "un", "u", "uom", "unit"],
  cantidad: ["cantidad", "cant", "qty", "ca", "vol"],
  precio_unitario: ["precio", "precio_unitario", "precio unitario", "p.unit", "pu", "precio unit", "costo", "costo unitario"],
  subtotal: ["subtotal", "total", "importe", "monto", "parcial"],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s._]/g, "")
    .trim();
}

function detectColumn(headers: string[], targetAliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of targetAliases) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseFile(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rawRows.length < 2) {
    throw new Error("El archivo no tiene datos suficientes (se necesita al menos header + 1 fila)");
  }

  const headers = (rawRows[0] as unknown[]).map((h) => String(h ?? ""));
  const colMap: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    colMap[field] = detectColumn(headers, aliases);
  }

  const dataRows = rawRows.slice(1).filter((row) => {
    const arr = row as unknown[];
    return arr.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
  });

  let lastRubro = "";
  return dataRows
    .map((row) => {
      const arr = row as unknown[];
      const getVal = (field: string): string => {
        const idx = colMap[field];
        if (idx === -1 || idx >= arr.length) return "";
        return String(arr[idx] ?? "").trim();
      };

      const rubro = getVal("rubro") || lastRubro;
      if (getVal("rubro")) lastRubro = rubro;

      return {
        rubro,
        descripcion: getVal("descripcion"),
        unidad: getVal("unidad"),
        cantidad: parseNumber(arr[colMap.cantidad] ?? null),
        precio_unitario: parseNumber(arr[colMap.precio_unitario] ?? null),
        subtotal: parseNumber(arr[colMap.subtotal] ?? null),
      };
    })
    .filter((r) => r.descripcion !== "");
}

export function ComputoUploader({ onParsed }: ComputoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);

    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      const ext = file.name.toLowerCase().split(".").pop();
      if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
        throw new Error("Formato no soportado. Usar .xlsx, .xls o .csv");
      }

      const buffer = await file.arrayBuffer();
      const rows = parseFile(buffer);

      if (rows.length === 0) {
        throw new Error("No se encontraron filas con datos válidos");
      }

      onParsed(rows, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar el archivo");
    } finally {
      setIsLoading(false);
    }
  }, [onParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
          ${isLoading ? "opacity-50 pointer-events-none" : ""}
        `}
        onClick={() => document.getElementById("computo-file-input")?.click()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">Procesando archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              {isDragging ? (
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {isDragging ? "Soltá el archivo acá" : "Arrastrá el archivo del cómputo"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                .xlsx, .xls o .csv — máx 10MB
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-2" type="button">
              Seleccionar archivo
            </Button>
          </div>
        )}
      </div>

      <input
        id="computo-file-input"
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
