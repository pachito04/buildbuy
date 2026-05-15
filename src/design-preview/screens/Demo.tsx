import { useState, useEffect } from "react";
import { DashboardScreen } from "./Dashboard";
import { InventarioScreen } from "./Inventario";
import { KanbanScreen } from "./Kanban";
import { CotizacionesScreen } from "./Cotizaciones";
import { LayoutDashboard, ClipboardList, Package, FileText, BarChart3, Truck, Layers, Lock, Sparkles, X, ChevronRight } from "lucide-react";

type DemoScreen = 'dashboard' | 'kanban' | 'cotizaciones' | 'inventario' | 'reportes' | 'trazabilidad' | 'pools' | 'deposito';
type Variant = 'brutalist' | 'softhigh' | 'editorial';
type Perfil = 'compras' | 'arquitecto' | 'proveedor' | 'deposito';

const NAV: { id: DemoScreen; label: string; icon: any; plan: 'bb' | 'bbplus'; perfiles: Perfil[] }[] = [
  { id: 'dashboard',    label: 'Dashboard',         icon: LayoutDashboard, plan: 'bb',     perfiles: ['compras', 'arquitecto', 'deposito'] },
  { id: 'kanban',       label: 'Requerimientos',    icon: ClipboardList,   plan: 'bb',     perfiles: ['compras', 'arquitecto'] },
  { id: 'cotizaciones', label: 'Cotizaciones',      icon: FileText,        plan: 'bb',     perfiles: ['compras', 'proveedor'] },
  { id: 'inventario',   label: 'Inventario',        icon: Package,         plan: 'bb',     perfiles: ['compras', 'deposito'] },
  { id: 'pools',        label: 'Pools de compra',   icon: Layers,          plan: 'bb',     perfiles: ['compras'] },
  { id: 'deposito',     label: 'Despacho · Recep.', icon: Truck,           plan: 'bb',     perfiles: ['deposito'] },
  { id: 'trazabilidad', label: 'Trazabilidad',      icon: ChevronRight,    plan: 'bbplus', perfiles: ['compras', 'arquitecto'] },
  { id: 'reportes',     label: 'Reportes avanz.',   icon: BarChart3,       plan: 'bbplus', perfiles: ['compras'] },
];

const PERFILES: { id: Perfil; label: string; full: string }[] = [
  { id: 'compras',    label: 'Compras',    full: 'Mariano Vivanco · Compras' },
  { id: 'arquitecto', label: 'Arquitecto', full: 'Lucía Casals · Arquitecta' },
  { id: 'proveedor',  label: 'Proveedor',  full: 'Acindar · Proveedor' },
  { id: 'deposito',   label: 'Depósito',   full: 'Diego Korman · Depósito' },
];

const COACHMARKS: Record<DemoScreen, { tag: string; title: string; body: string } | null> = {
  dashboard:    { tag: 'Paso 1 · Dashboard', title: 'Empezás acá', body: 'El dashboard te muestra obras activas, requerimientos abiertos y cotizaciones que vencen. Toda la información que necesitás para arrancar el día.' },
  kanban:       { tag: 'Paso 2 · Requerimientos', title: 'Tu cola de trabajo', body: 'Cada requerimiento es una tarjeta. Arrastrá entre columnas para cambiar estado. La columna roja te avisa rechazos para revisar.' },
  cotizaciones: { tag: 'Paso 3 · Cotizaciones', title: 'Comparativa lado a lado', body: 'Recibís las cotizaciones de proveedores juntas. La comparativa ya marca la mejor oferta por ítem; podés adjudicar split o full a un proveedor.' },
  inventario:   { tag: 'Paso 4 · Inventario', title: 'Stock real, no nominal', body: 'Acá ves stock disponible (descontando lo reservado). Los items críticos se marcan en rojo automáticamente para que no te queden sin material.' },
  pools:        null, deposito: null, trazabilidad: null, reportes: null,
};

export function DemoFlow({ variant }: { variant: Variant }) {
  const [screen, setScreen] = useState<DemoScreen>('dashboard');
  const [perfil, setPerfil] = useState<Perfil>('compras');
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const tourScreens: DemoScreen[] = ['dashboard', 'kanban', 'cotizaciones', 'inventario'];
  useEffect(() => {
    if (showTour) setScreen(tourScreens[tourStep]);
  }, [tourStep, showTour]);

  const filteredNav = NAV.filter(n => n.perfiles.includes(perfil));
  const currentNavItem = NAV.find(n => n.id === screen);
  const isLocked = currentNavItem?.plan === 'bbplus';

  return (
    <div>
      {/* Demo banner */}
      <div className="bb-demo-banner">
        <span className="bb-demo-banner-dot" />
        <span><strong>Modo demo</strong> — los cambios no se guardan. Datos ficticios.</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Perfil:</span>
          {PERFILES.map(p => (
            <button key={p.id} onClick={() => { setPerfil(p.id); setScreen(NAV.find(n => n.perfiles.includes(p.id))!.id); }} style={{
              padding: '4px 10px',
              fontSize: 11,
              fontFamily: 'inherit',
              borderRadius: variant === 'brutalist' ? 0 : 9999,
              border: '1px solid currentColor',
              background: perfil === p.id ? 'currentColor' : 'transparent',
              color: perfil === p.id ? (variant === 'brutalist' ? 'var(--bb-fg)' : 'var(--bb-bg)') : 'inherit',
              cursor: 'pointer',
              textTransform: variant === 'brutalist' ? 'uppercase' : 'none',
              letterSpacing: variant === 'brutalist' ? '0.12em' : 'normal',
            }}>
              <span style={{ filter: perfil === p.id ? 'invert(1)' : 'none' }}>{p.label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => { setShowTour(true); setTourStep(0); }} style={{
          padding: '6px 12px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          border: '1px solid var(--bb-accent)',
          background: 'var(--bb-accent)', color: '#fff',
          borderRadius: variant === 'brutalist' ? 0 : 9999,
          textTransform: variant === 'brutalist' ? 'uppercase' : 'none',
          letterSpacing: variant === 'brutalist' ? '0.12em' : 'normal',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Sparkles size={12} /> {showTour ? 'Tour activo' : 'Iniciar tour guiado'}
        </button>
      </div>

      <div className="bb-demo-layout">
        {/* Sidebar */}
        <aside className="bb-demo-sidebar">
          <div style={{ padding: '4px 12px 20px', borderBottom: variant === 'brutalist' ? '1.5px solid rgba(255,255,255,0.15)' : '1px solid var(--bb-bg-line)', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 22, fontWeight: variant === 'editorial' ? 400 : 700, letterSpacing: '-0.02em', fontStyle: variant === 'editorial' ? 'italic' : 'normal' }}>
              Build<span style={{ color: 'var(--bb-accent)' }}>Buy</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, fontFamily: 'var(--bb-font-mono)' }}>{PERFILES.find(p => p.id === perfil)?.full}</div>
          </div>

          <div className="bb-demo-sidebar-section">Operaciones</div>
          {filteredNav.map(item => {
            const Icon = item.icon;
            const isActive = screen === item.id;
            const isLockItem = item.plan === 'bbplus';
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`bb-demo-nav-item ${isActive ? 'is-active' : ''}`}
                style={{ width: '100%', background: isActive ? undefined : 'transparent', border: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                {isLockItem && <span className="bb-lock"><Lock size={9} style={{ display: 'inline-block', marginRight: 2 }} />BB+</span>}
              </button>
            );
          })}

          <div className="bb-demo-sidebar-section">Sistema</div>
          <button className="bb-demo-nav-item" style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
            <Sparkles size={15} /> <span>Plan</span>
            <span className="bb-lock" style={{ background: variant === 'brutalist' ? 'transparent' : 'var(--bb-bg)', color: 'inherit' }}>BB</span>
          </button>
        </aside>

        {/* Main */}
        <main className="bb-demo-content">
          {isLocked ? (
            <PaywallView variant={variant} screen={screen} />
          ) : (
            <>
              {screen === 'dashboard'    && <DashboardScreen variant={variant} />}
              {screen === 'kanban'       && <KanbanScreen variant={variant} />}
              {screen === 'cotizaciones' && <CotizacionesScreen variant={variant} />}
              {screen === 'inventario'   && <InventarioScreen variant={variant} />}
              {screen === 'pools'        && <PlaceholderView title="Pools de compra" subtitle="Agrupá requerimientos de distintas obras para mejor poder de negociación con proveedores." variant={variant} />}
              {screen === 'deposito'     && <PlaceholderView title="Despacho y recepción" subtitle="Operativa de depósito: despachá a obra con remito digital, recibí OC con stock reservado." variant={variant} />}
            </>
          )}
        </main>
      </div>

      {/* Coachmark */}
      {showTour && COACHMARKS[screen] && (
        <Coachmark
          step={tourStep + 1}
          total={tourScreens.length}
          data={COACHMARKS[screen]!}
          onSkip={() => setShowTour(false)}
          onNext={() => {
            if (tourStep < tourScreens.length - 1) setTourStep(tourStep + 1);
            else setShowTour(false);
          }}
        />
      )}
    </div>
  );
}

function Coachmark({ step, total, data, onSkip, onNext }: { step: number; total: number; data: { tag: string; title: string; body: string }; onSkip: () => void; onNext: () => void }) {
  return (
    <div className="bb-coachmark" style={{ right: 24, bottom: 24 }}>
      <span className="bb-coachmark-tag">{data.tag}</span>
      <div className="bb-coachmark-title">{data.title}</div>
      <p style={{ margin: 0 }}>{data.body}</p>
      <div className="bb-coachmark-actions">
        <span className="bb-coachmark-step">Paso {step} de {total}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="bb-coachmark-btn bb-coachmark-btn-ghost" onClick={onSkip}>Saltar</button>
          <button className="bb-coachmark-btn" onClick={onNext}>{step === total ? 'Terminar' : 'Siguiente →'}</button>
        </div>
      </div>
    </div>
  );
}

function PaywallView({ variant, screen }: { variant: Variant; screen: DemoScreen }) {
  const titles: Record<string, { t: string; d: string }> = {
    trazabilidad: { t: 'Trazabilidad por lote', d: 'Seguí cada material desde la OC hasta su uso final en obra. Auditoría completa, certificados de calidad por lote, ingreso/salida granular.' },
    reportes:     { t: 'Reportes avanzados', d: 'Custom dashboards con tu data: heatmaps de proveedores, evolución de precios por material y obra, análisis de cumplimiento de plazos.' },
  };
  const info = titles[screen] || { t: 'Feature de BuildBuy +', d: 'Esta sección está disponible en el plan enterprise.' };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto' }}>
      <div className="bb-plangate">
        <span className="bb-plangate-tag"><Lock size={11} /> Requiere BuildBuy +</span>
        <h2 style={{ fontSize: 36, marginTop: 12, marginBottom: 4 }}>
          {variant === 'editorial' ? <em>{info.t}</em> : info.t}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--bb-fg-muted)', marginBottom: 16 }}>{info.d}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="bb-btn-primary">Hablar con ventas →</button>
          <button className="bb-btn-ghost">Ver planes</button>
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <span data-eyebrow style={{ marginBottom: 12, display: 'block' }}>Preview de la feature</span>
        <div className="bb-plangate-blur">
          <PlaceholderChart variant={variant} />
        </div>
      </div>
    </div>
  );
}

function PlaceholderChart({ variant }: { variant: Variant }) {
  const bars = [42, 78, 56, 91, 33, 67, 48, 88, 71];
  return (
    <div className="bb-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Evolución de precios — Cemento</h3>
          <span data-eyebrow>últimos 9 meses</span>
        </div>
        <span style={{ fontFamily: 'var(--bb-font-display)', fontSize: 32, color: 'var(--bb-accent)' }}>–12.4%</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: `${b}%`, background: i === bars.length - 1 ? 'var(--bb-accent)' : 'var(--bb-bg-line)', borderRadius: variant === 'brutalist' ? 0 : 4 }} />
        ))}
      </div>
    </div>
  );
}

function PlaceholderView({ title, subtitle, variant }: { title: string; subtitle: string; variant: Variant }) {
  return (
    <div style={{ padding: '64px 32px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
      <span data-eyebrow>módulo demo</span>
      <h1 style={{ fontSize: 56, marginTop: 16, marginBottom: 16 }}>
        {variant === 'editorial' ? <em>{title}</em> : title}
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--bb-fg-muted)', maxWidth: '50ch', margin: '0 auto 32px' }}>{subtitle}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="bb-btn-primary">Pantalla principal →</button>
        <button className="bb-btn-ghost">Ver demo en otro perfil</button>
      </div>
    </div>
  );
}
