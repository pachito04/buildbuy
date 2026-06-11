import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadPlantillaPrecios } from '@/lib/consumos/plantilla-precios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedPrecioRow {
  material_name: string;
  precio_unitario: number;
  unidad_medida: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

interface PreciosUploaderProps {
  onParsed: (rows: ParsedPrecioRow[], file: File) => void;
}

// ---------------------------------------------------------------------------
// Column aliases — same normalisation as ComputoUploader
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<string, string[]> = {
  material_name: [
    'material',
    'descripcion',
    'descripción',
    'nombre',
    'item',
    'ítem',
    'concepto',
    'articulo',
    'artículo',
  ],
  precio_unitario: [
    'precio',
    'precio_unitario',
    'precio unitario',
    'p.unit',
    'pu',
    'precio unit',
    'costo',
    'costo unitario',
    'importe',
  ],
  unidad_medida: ['unidad', 'unidad_medida', 'ud', 'un', 'u', 'uom', 'unit', 'uds'],
  vigencia_desde: [
    'vigencia_desde',
    'desde',
    'fecha desde',
    'fecha_desde',
    'inicio',
    'vigencia desde',
  ],
  vigencia_hasta: [
    'vigencia_hasta',
    'hasta',
    'fecha hasta',
    'fecha_hasta',
    'vencimiento',
    'vigencia hasta',
    'fin',
  ],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers (mirroring ComputoUploader internals)
// ---------------------------------------------------------------------------

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s._]/g, '')
    .trim();
}

function detectColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const str = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Converts an Excel serial date or a string date to YYYY-MM-DD.
 * Returns null if unparseable.
 */
function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel serial → JS date
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, '0');
    const d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  // Attempt ISO already
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
  if (iso) return iso;
  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3 && parts[0].length <= 2) {
    const [d, m, y] = parts;
    return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseFile(buffer: ArrayBuffer): ParsedPrecioRow[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  });

  if (rawRows.length < 2) {
    throw new Error(
      'El archivo no tiene datos suficientes (se necesita al menos encabezado + 1 fila).'
    );
  }

  const headers = (rawRows[0] as unknown[]).map((h) => String(h ?? ''));
  const colMap: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    colMap[field] = detectColumn(headers, aliases);
  }

  const dataRows = rawRows
    .slice(1)
    .filter((row) =>
      (row as unknown[]).some(
        (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''
      )
    );

  const today = new Date().toISOString().split('T')[0];

  const parsed: ParsedPrecioRow[] = [];
  for (const row of dataRows) {
    const arr = row as unknown[];

    const getVal = (field: string): unknown => {
      const idx = colMap[field];
      if (idx === -1 || idx >= arr.length) return '';
      return arr[idx];
    };

    const material_name = String(getVal('material_name') ?? '').trim();
    if (!material_name) continue;

    const precio_unitario = parseNumber(getVal('precio_unitario'));
    if (precio_unitario === null || precio_unitario <= 0) continue;

    const unidad_medida = String(getVal('unidad_medida') ?? '').trim() || 'u';
    const vigencia_desde = parseDate(getVal('vigencia_desde')) ?? today;
    const vigencia_hasta = parseDate(getVal('vigencia_hasta'));

    parsed.push({ material_name, precio_unitario, unidad_medida, vigencia_desde, vigencia_hasta });
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreciosUploader({ onParsed }: PreciosUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);
      try {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
        }
        const ext = file.name.toLowerCase().split('.').pop();
        if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
          throw new Error('Formato no soportado. Usar .xlsx, .xls o .csv.');
        }
        const buffer = await file.arrayBuffer();
        const rows = parseFile(buffer);
        if (rows.length === 0) {
          throw new Error('No se encontraron filas válidas. Verificar columnas requeridas.');
        }
        onParsed(rows, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al procesar el archivo.');
      } finally {
        setIsLoading(false);
      }
    },
    [onParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    },
    [processFile]
  );

  return (
    <div className="space-y-3">
      {/* Template download — always visible; does NOT touch upload state */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => downloadPlantillaPrecios()}
        >
          <Download className="h-4 w-4 mr-2" />
          Descargar plantilla
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isLoading ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
        onClick={() => document.getElementById('precios-file-input')?.click()}
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
                {isDragging ? 'Soltá el archivo acá' : 'Importar lista de precios desde Excel'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Columnas: material, precio_unitario, unidad_medida, vigencia_desde —{' '}
                .xlsx, .xls o .csv · máx 10 MB
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-2" type="button">
              Seleccionar archivo
            </Button>
          </div>
        )}
      </div>

      <input
        id="precios-file-input"
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
