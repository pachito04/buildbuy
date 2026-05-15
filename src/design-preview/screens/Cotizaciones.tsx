import { seedCotizaciones } from "../seed";
import { Clock, TrendingDown, Users, ArrowRight } from "lucide-react";

export function CotizacionesScreen({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: 32, maxWidth: 1500, margin: '0 auto' }}>
      {variant === 'brutalist' && <BrutalistHeader />}
      {variant === 'softhigh' && <SoftHeader />}
      {variant === 'editorial' && <EditorialHeader />}

      <div style={{ display: 'grid', gap: variant === 'brutalist' ? 0 : 16, marginTop: variant === 'brutalist' ? 0 : 24 }}>
        {seedCotizaciones.map((c, idx) => (
          <CotRow key={c.id} c={c} idx={idx} variant={variant} />
        ))}
      </div>
    </section>
  );
}

function BrutalistHeader() {
  return (
    <>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1.5px solid var(--bb-fg)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ COTIZACIONES / RFQ ABIERTAS ]</span>
        <span data-mono>{seedCotizaciones.length} RFQ EN COMPARATIVA</span>
        <span>● VIGENTE</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '40px 0 24px', borderBottom: '1.5px solid var(--bb-fg)' }}>
        <div>
          <div data-eyebrow style={{ marginBottom: 12 }}>[ COMPARATIVA · ADJUDICACION ]</div>
          <h1 style={{ fontSize: 72 }}>Cotizaciones</h1>
        </div>
        <button className="bb-btn-primary">&gt;&gt; Nueva RFQ</button>
      </div>
    </>
  );
}

function SoftHeader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
      <div>
        <span data-eyebrow>Compras</span>
        <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 8 }}>Cotizaciones</h1>
        <p style={{ color: 'var(--bb-fg-muted)', marginTop: 8 }}>{seedCotizaciones.length} RFQ esperando adjudicación</p>
      </div>
      <button className="bb-btn-primary">
        Nueva RFQ <span data-trailing><ArrowRight size={14} /></span>
      </button>
    </div>
  );
}

function EditorialHeader() {
  return (
    <>
      <div style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1px solid var(--bb-card-line)', padding: '16px 0', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--bb-fg-muted)' }}>
        <span>Cotizaciones</span>
        <span>RFQ en comparativa</span>
        <span>{seedCotizaciones.length} solicitudes</span>
      </div>
      <div style={{ padding: '48px 0', borderBottom: '2px solid var(--bb-fg)' }}>
        <span data-eyebrow>Compras</span>
        <h1 style={{ fontSize: 80, marginTop: 16 }}>
          <em>Comparativas</em> abiertas.
        </h1>
      </div>
    </>
  );
}

function CotRow({ c, idx, variant }: { c: typeof seedCotizaciones[number]; idx: number; variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  const ahorroColor = c.ahorro >= 15 ? 'var(--bb-success)' : c.ahorro >= 10 ? 'var(--bb-accent)' : 'var(--bb-warning)';

  if (variant === 'brutalist') {
    return (
      <div style={{ border: '1.5px solid var(--bb-fg)', borderTop: idx === 0 ? '1.5px solid var(--bb-fg)' : 'none', padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 1fr', gap: 24, background: 'var(--bb-card)', alignItems: 'center' }}>
        <div>
          <div data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--bb-fg-muted)' }}>{c.rfq}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{c.obra}</div>
        </div>
        <div>
          <div data-eyebrow style={{ marginBottom: 4 }}>[ ITEMS / PROV ]</div>
          <div data-mono style={{ fontSize: 14 }}>{c.items} ítems · {c.proveedores} prov.</div>
        </div>
        <div>
          <div data-eyebrow style={{ marginBottom: 4 }}>[ MEJOR OFERTA ]</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{c.mejor}</div>
          <div data-mono style={{ fontSize: 11, color: ahorroColor, marginTop: 4 }}>▼ {c.ahorro}% vs. mediana</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="bb-pill" style={{ color: c.vence === 'hoy' ? 'var(--bb-danger)' : 'var(--bb-fg)', borderColor: c.vence === 'hoy' ? 'var(--bb-danger)' : 'var(--bb-fg)' }}>VENCE {c.vence}</span>
          <div style={{ marginTop: 12 }}>
            <button className="bb-btn-primary" style={{ padding: '8px 12px', fontSize: 11 }}>&gt;&gt; Adjudicar</button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'editorial') {
    return (
      <article style={{ display: 'grid', gridTemplateColumns: '60px 2fr 1fr 1.4fr 1fr', gap: 24, padding: '28px 0', borderBottom: '1px solid var(--bb-card-line)', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 32, color: 'var(--bb-accent)' }}>{String(idx+1).padStart(2,'0')}.</span>
        <div>
          <span data-eyebrow>{c.rfq}</span>
          <h3 style={{ fontSize: 22, marginTop: 4 }}>{c.obra}</h3>
        </div>
        <div>
          <span data-eyebrow>Items · prov.</span>
          <div style={{ marginTop: 4, fontFamily: 'var(--bb-font-mono)', fontSize: 14 }}>{c.items} / {c.proveedores}</div>
        </div>
        <div>
          <span data-eyebrow>Mejor oferta</span>
          <div style={{ fontSize: 16, marginTop: 4 }}>{c.mejor}</div>
          <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 20, color: ahorroColor }}>–{c.ahorro}%</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="bb-pill" style={{ background: 'transparent', border: `1px solid ${c.vence === 'hoy' ? 'var(--bb-danger)' : 'var(--bb-fg)'}`, color: c.vence === 'hoy' ? 'var(--bb-danger)' : 'var(--bb-fg)' }}>vence {c.vence}</span>
        </div>
      </article>
    );
  }

  // softhigh
  return (
    <div className="bb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.4fr 1fr 100px', gap: 20, alignItems: 'center' }}>
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span data-mono style={{ fontSize: 11, color: 'var(--bb-fg-muted)' }}>{c.rfq}</span>
          <span className="bb-pill" style={{ padding: '2px 8px', fontSize: 10 }}>{c.vence === 'hoy' ? 'urgente' : 'vigente'}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{c.obra}</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--bb-fg-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={12} /> {c.proveedores} prov.</div>
        <div style={{ marginTop: 4 }}>{c.items} ítems</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--bb-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Mejor oferta</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{c.mejor}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: ahorroColor }}>
        <TrendingDown size={14} />
        <span style={{ fontFamily: 'var(--bb-font-display)', fontSize: 24, fontWeight: 600 }}>{c.ahorro}%</span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: c.vence === 'hoy' ? 'var(--bb-danger)' : 'var(--bb-fg-muted)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <Clock size={12} /> {c.vence}
      </div>
    </div>
  );
}
