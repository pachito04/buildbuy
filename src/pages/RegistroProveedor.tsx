import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Building2, FileText, Shield, Upload } from "lucide-react";
import logoBuildBuy from "@/assets/logo-buildbuy.png";

const MATERIAL_CATEGORIES = [
  "Acero", "Concreto", "Eléctrico", "Plomería", "Acabados",
  "Herrería", "Madera", "Impermeabilización", "Pintura", "Ferretería",
  "Maquinaria", "Seguridad Industrial", "Otros",
];

const TAX_REGIMES = [
  "Régimen General de Ley",
  "Régimen de Incorporación Fiscal (RIF)",
  "Régimen Simplificado de Confianza (RESICO)",
  "Persona Física con Actividad Empresarial",
  "Otro",
];

const DOC_TYPES = [
  { key: "constancia_fiscal", label: "Constancia de Situación Fiscal" },
  { key: "acta_constitutiva", label: "Acta Constitutiva" },
  { key: "identificacion", label: "Identificación Oficial del Representante" },
  { key: "comprobante_domicilio", label: "Comprobante de Domicilio" },
];

type Step = 1 | 2 | 3 | 4;

export default function RegistroProveedor() {
  const [step, setStep] = useState<Step>(1);
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();

  // Step 1: Company info
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2: Fiscal info
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccionFiscal, setDireccionFiscal] = useState("");
  const [taxRegime, setTaxRegime] = useState("");

  // Step 3: Categories & capabilities
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [deliveryCapabilities, setDeliveryCapabilities] = useState("");

  // Step 4: T&C
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Documents
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { name: string; url: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const uploadDoc = async (docType: string, file: File) => {
    setUploading(docType);
    try {
      const ext = file.name.split(".").pop();
      const path = `onboarding/${Date.now()}_${docType}.${ext}`;
      const { error } = await supabase.storage.from("provider-docs").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("provider-docs").getPublicUrl(path);
      setUploadedDocs((prev) => ({ ...prev, [docType]: { name: file.name, url: urlData.publicUrl } }));
      toast({ title: "Documento subido" });
    } catch (e: any) {
      toast({ title: "Error al subir", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const submitRegistration = useMutation({
    mutationFn: async () => {
      // Create provider record
      const { data: provider, error } = await supabase
        .from("providers")
        .insert({
          name: companyName,
          contact_name: contactName,
          email,
          phone,
          rfc: rfc || null,
          razon_social: razonSocial || null,
          direccion_fiscal: direccionFiscal || null,
          tax_regime: taxRegime || null,
          categories: selectedCategories,
          delivery_capabilities: deliveryCapabilities || null,
          terms_accepted_at: new Date().toISOString(),
          verification_status: "pending",
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Upload document references
      const docInserts = Object.entries(uploadedDocs).map(([docType, doc]) => ({
        provider_id: (provider as any).id,
        doc_type: docType,
        file_name: doc.name,
        file_url: doc.url,
      }));
      if (docInserts.length > 0) {
        const { error: docErr } = await supabase.from("provider_documents").insert(docInserts);
        if (docErr) throw docErr;
      }
    },
    onSuccess: () => setCompleted(true),
    onError: (e: Error) =>
      toast({ title: "Error en registro", description: e.message, variant: "destructive" }),
  });

  if (completed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold font-display">¡Registro Exitoso!</h2>
            <p className="text-muted-foreground text-sm">
              Tu solicitud de registro ha sido enviada. Nuestro equipo de compras revisará tu
              información y documentación. Te notificaremos cuando tu cuenta sea verificada.
            </p>
            <Badge variant="secondary" className="text-sm">Estado: Pendiente de Verificación</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <img src={logoBuildBuy} alt="BuildBuy" className="h-8 w-auto" />
          <div>
            <h1 className="font-display text-lg font-bold">Registro de Proveedor</h1>
            <p className="text-xs text-muted-foreground">Complete el formulario para registrarse como proveedor en BuildBuy</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-8">
          {[
            { n: 1, label: "Empresa", icon: Building2 },
            { n: 2, label: "Fiscal", icon: FileText },
            { n: 3, label: "Categorías", icon: Shield },
            { n: 4, label: "T&C y Docs", icon: Upload },
          ].map(({ n, label, icon: Icon }, i) => (
            <div key={n} className="flex items-center flex-1">
              <button
                onClick={() => n < step && setStep(n as Step)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
                  step === n
                    ? "bg-primary text-primary-foreground"
                    : step > n
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{n}</span>
              </button>
              {i < 3 && <div className="w-4 h-px bg-border mx-1 shrink-0" />}
            </div>
          ))}
        </div>

        {/* Step 1: Company Info */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Información de la Empresa</CardTitle>
              <CardDescription>Datos generales de contacto</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => { e.preventDefault(); setStep(2); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Nombre de la empresa *</Label>
                  <Input placeholder="Ej: Materiales del Norte S.A. de C.V." value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Nombre del contacto principal *</Label>
                  <Input placeholder="Nombre completo" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono *</Label>
                    <Input placeholder="+52 55 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                </div>
                <Button type="submit" className="w-full">Siguiente →</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Fiscal Info */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Información Fiscal</CardTitle>
              <CardDescription>Datos fiscales para facturación y cumplimiento</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => { e.preventDefault(); setStep(3); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>RFC *</Label>
                  <Input placeholder="Ej: MAT850101ABC" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} required maxLength={13} />
                </div>
                <div className="space-y-2">
                  <Label>Razón Social *</Label>
                  <Input placeholder="Razón social tal como aparece en la constancia fiscal" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Dirección Fiscal *</Label>
                  <Textarea placeholder="Calle, número, colonia, CP, ciudad, estado" value={direccionFiscal} onChange={(e) => setDireccionFiscal(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Régimen Fiscal *</Label>
                  <Select value={taxRegime} onValueChange={setTaxRegime} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>← Anterior</Button>
                  <Button type="submit" className="flex-1">Siguiente →</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Categories & Capabilities */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Categorías y Capacidades</CardTitle>
              <CardDescription>Selecciona las categorías de materiales que manejas</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (selectedCategories.length === 0) {
                    toast({ title: "Selecciona al menos una categoría", variant: "destructive" });
                    return;
                  }
                  setStep(4);
                }}
                className="space-y-6"
              >
                <div className="space-y-3">
                  <Label>Categorías de materiales *</Label>
                  <div className="flex flex-wrap gap-2">
                    {MATERIAL_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                          selectedCategories.includes(cat)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedCategories.length} categoría(s) seleccionada(s)</p>
                </div>
                <div className="space-y-2">
                  <Label>Capacidades de entrega</Label>
                  <Textarea
                    placeholder="Describe tus capacidades: tiempos de entrega, zonas de cobertura, flotilla, etc."
                    value={deliveryCapabilities}
                    onChange={(e) => setDeliveryCapabilities(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>← Anterior</Button>
                  <Button type="submit" className="flex-1">Siguiente →</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Documents & T&C */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Documentación y Términos</CardTitle>
              <CardDescription>Sube la documentación requerida y acepta los términos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Document uploads */}
              <div className="space-y-3">
                <Label>Documentación requerida</Label>
                {DOC_TYPES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      {uploadedDocs[key] && (
                        <p className="text-xs text-primary">✓ {uploadedDocs[key].name}</p>
                      )}
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadDoc(key, file);
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" disabled={uploading === key} asChild>
                        <span>
                          <Upload className="h-3 w-3 mr-1" />
                          {uploading === key ? "Subiendo..." : uploadedDocs[key] ? "Cambiar" : "Subir"}
                        </span>
                      </Button>
                    </label>
                  </div>
                ))}
              </div>

              {/* Terms & Conditions */}
              <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
                <h3 className="font-medium text-sm">Términos y Condiciones</h3>
                <div className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
                  <p>Al registrarse como proveedor en BuildBuy, usted acepta:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Proporcionar información veraz y actualizada sobre su empresa.</li>
                    <li>Responder a las solicitudes de cotización (RFQ) en los plazos establecidos.</li>
                    <li>Mantener los precios cotizados durante el período de vigencia indicado.</li>
                    <li>Cumplir con los tiempos de entrega comprometidos en las órdenes de compra aceptadas.</li>
                    <li>Notificar cualquier cambio en su situación fiscal o capacidad de entrega.</li>
                    <li>Aceptar que BuildBuy mantendrá un scoring basado en su desempeño.</li>
                    <li>Mantener la confidencialidad de la información recibida a través de la plataforma.</li>
                  </ul>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(v) => setTermsAccepted(v === true)}
                  />
                  <label htmlFor="terms" className="text-sm cursor-pointer">
                    Acepto los Términos y Condiciones de BuildBuy
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)}>← Anterior</Button>
                <Button
                  className="flex-1"
                  disabled={!termsAccepted || submitRegistration.isPending}
                  onClick={() => submitRegistration.mutate()}
                >
                  {submitRegistration.isPending ? "Enviando registro..." : "Completar Registro"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
