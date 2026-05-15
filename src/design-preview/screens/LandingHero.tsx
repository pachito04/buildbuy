import { seedLanding } from "../seed";
import { ArrowUpRight, Building2, ClipboardList, FileText, Package, ShoppingCart, Warehouse } from "lucide-react";

export function LandingHero({ variant }: { variant: 'brutalist' | 'softhigh' | 'editorial' }) {
  return (
    <section className="bb-section" style={{ padding: variant === 'brutalist' ? '0' : '40px 32px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        {variant === 'brutalist' && <BrutalistLanding />}
        {variant === 'softhigh' && <SoftHighLanding />}
        {variant === 'editorial' && <EditorialLanding />}
      </div>
    </section>
  );
}

/* ─────────── A — Industrial Brutalist ─────────── */
function BrutalistLanding() {
  const L = seedLanding;
  return (
    <div className="bb-reveal" style={{ '--i': 0 } as React.CSSProperties}>
      {/* Top tactical bar */}
      <div style={{ borderBottom: '1.5px solid var(--bb-fg)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ BUILD/BUY ™ ]</span>
        <span data-mono>REV 2.6 — UNIT / AR-001</span>
        <span>[ ES — AR ]</span>
      </div>
      {/* Hero grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1.5px solid var(--bb-fg)' }}>
        <div style={{ padding: '80px 48px 60px 0', borderRight: '1.5px solid var(--bb-fg)' }}>
          <div data-eyebrow style={{ marginBottom: 24 }}>[ ESPEC // {L.heroEyebrow.toUpperCase()} ]</div>
          <h1 style={{ fontSize: 'clamp(48px, 7vw, 96px)', whiteSpace: 'pre-line', marginBottom: 32 }}>{L.heroTitle}</h1>
          <p style={{ fontSize: 16, maxWidth: '52ch', lineHeight: 1.6, color: 'var(--bb-fg-muted)', marginBottom: 40 }}>{L.heroSub}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="bb-btn-primary">&gt;&gt; Probar la demo</button>
            <button className="bb-btn-ghost">Plan BB+</button>
          </div>
        </div>
        <div style={{ padding: '80px 0 60px 48px', display: 'grid', gridTemplateRows: '1fr 1fr 1fr', gap: 0 }}>
          {[L.metric1, L.metric2, L.metric3].map((m, i) => (
            <div key={i} style={{ borderBottom: i < 2 ? '1.5px solid var(--bb-fg)' : 'none', padding: '20px 0', display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 24 }}>
              <span data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--bb-fg-muted)' }}>+ MET / 0{i+1}</span>
              <div>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.9, color: 'var(--bb-accent)' }}>{m.value}</div>
                <div style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', marginTop: 8 }}>{m.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans grid */}
      <div data-eyebrow style={{ padding: '60px 0 24px', display: 'flex', justifyContent: 'space-between' }}>
        <span>[ SECCION 02 — PLANES ]</span>
        <span data-mono>02 / 04</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1.5px solid var(--bb-fg)' }}>
        <PlanCardBrutalist plan={L.planBb} variant="bb" />
        <PlanCardBrutalist plan={L.planBbPlus} variant="bbplus" />
      </div>
    </div>
  );
}

function PlanCardBrutalist({ plan, variant }: { plan: typeof seedLanding.planBb; variant: 'bb' | 'bbplus' }) {
  return (
    <div style={{
      padding: 40,
      borderRight: variant === 'bb' ? '1.5px solid var(--bb-fg)' : 'none',
      background: variant === 'bbplus' ? 'var(--bb-fg)' : 'var(--bb-card)',
      color: variant === 'bbplus' ? 'var(--bb-bg)' : 'var(--bb-fg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontFamily: 'var(--bb-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
        <span>[ {plan.tag} ]</span>
        <span>{variant === 'bb' ? '01' : '02'}</span>
      </div>
      <h2 style={{ fontSize: 56, marginBottom: 16, color: variant === 'bbplus' ? 'var(--bb-accent)' : 'inherit' }}>{plan.name}</h2>
      <p style={{ marginBottom: 32, maxWidth: '40ch', lineHeight: 1.6, opacity: 0.8 }}>{plan.desc}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'grid', gap: 12 }}>
        {plan.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: 16, fontFamily: 'var(--bb-font-mono)', fontSize: 12, alignItems: 'baseline' }}>
            <span data-mono style={{ opacity: 0.5 }}>{String(i+1).padStart(2,'0')}</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button className={variant === 'bbplus' ? 'bb-btn-ghost' : 'bb-btn-primary'} style={variant === 'bbplus' ? { color: 'var(--bb-bg)', borderColor: 'var(--bb-bg)' } : undefined}>
        &gt;&gt; {plan.cta}
      </button>
    </div>
  );
}

/* ─────────── B — High-End Soft Structuralism ─────────── */
function SoftHighLanding() {
  const L = seedLanding;
  return (
    <div className="bb-section">
      {/* Floating glass nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', margin: '12px auto 80px', maxWidth: 900, borderRadius: 9999, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid var(--bb-card-line)', boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 12px 32px -16px rgba(20,19,15,0.08)' }}>
        <div style={{ fontFamily: 'var(--bb-font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
          BuildBuy<span style={{ color: 'var(--bb-accent)' }}>.</span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--bb-fg-muted)' }}>
          <a>Plataforma</a><a>Planes</a><a>Casos</a><a>Empresa</a>
        </div>
        <button className="bb-btn-primary" style={{ fontSize: 13, padding: '8px 8px 8px 16px' }}>
          Probar demo <span data-trailing><ArrowUpRight size={14} /></span>
        </button>
      </nav>

      <div className="bb-reveal" style={{ '--i': 1, textAlign: 'left', maxWidth: 1100, margin: '0 auto', padding: '0 24px' } as React.CSSProperties}>
        <span data-eyebrow style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid var(--bb-card-line)', borderRadius: 9999, marginBottom: 32, background: 'var(--bb-card)' }}>
          Plataforma de compras para constructoras
        </span>
        <h1 style={{ fontSize: 'clamp(48px, 7vw, 92px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 32, maxWidth: '14ch' }}>
          Comprar materiales deja de ser un cuello de botella.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--bb-fg-muted)', maxWidth: '60ch', marginBottom: 40 }}>
          {L.heroSub}
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 96 }}>
          <button className="bb-btn-primary">
            Probar la demo <span data-trailing><ArrowUpRight size={14} /></span>
          </button>
          <button className="bb-btn-ghost">Ver planes</button>
        </div>
      </div>

      {/* Doppelrand metrics tray */}
      <div className="bb-card-tray bb-reveal" style={{ '--i': 2, maxWidth: 1100, margin: '0 auto 96px' } as React.CSSProperties}>
        <div className="bb-card-inner" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[L.metric1, L.metric2, L.metric3].map((m, i) => (
            <div key={i} style={{ padding: '8px 24px', borderLeft: i > 0 ? '1px solid var(--bb-card-line)' : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 64, fontWeight: 600, color: 'var(--bb-accent)', letterSpacing: '-0.04em', lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 13, color: 'var(--bb-fg-muted)', marginTop: 12 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span data-eyebrow>Dos planes, una plataforma</span>
          <h2 style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-0.04em', marginTop: 16 }}>Elegí cómo arrancar.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <PlanCardSoft plan={L.planBb} variant="bb" />
          <PlanCardSoft plan={L.planBbPlus} variant="bbplus" />
        </div>
      </div>
    </div>
  );
}

function PlanCardSoft({ plan, variant }: { plan: typeof seedLanding.planBb; variant: 'bb' | 'bbplus' }) {
  const isPlus = variant === 'bbplus';
  return (
    <div className="bb-card-tray bb-reveal" style={{ '--i': isPlus ? 4 : 3 } as React.CSSProperties}>
      <div className="bb-card-inner" style={{ padding: 40, position: 'relative', overflow: 'hidden', background: isPlus ? 'var(--bb-fg)' : 'var(--bb-card)', color: isPlus ? '#fff' : 'inherit' }}>
        {isPlus && <div style={{ position: 'absolute', top: 24, right: 24 }}>
          <span style={{ fontFamily: 'var(--bb-font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', padding: '4px 10px', borderRadius: 9999, background: 'var(--bb-accent)', color: '#fff' }}>recomendado</span>
        </div>}
        <span data-eyebrow style={{ color: isPlus ? 'rgba(255,255,255,0.6)' : 'var(--bb-fg-muted)' }}>{plan.tag}</span>
        <h3 style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 12, marginBottom: 16 }}>{plan.name}</h3>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: isPlus ? 'rgba(255,255,255,0.7)' : 'var(--bb-fg-muted)', marginBottom: 32, maxWidth: '34ch' }}>{plan.desc}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px', display: 'grid', gap: 14 }}>
          {plan.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14, alignItems: 'center' }}>
              <span style={{ width: 18, height: 18, borderRadius: 9999, background: isPlus ? 'rgba(255,255,255,0.12)' : 'var(--bb-accent-soft)', color: 'var(--bb-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button className={isPlus ? 'bb-btn-accent' : 'bb-btn-primary'} style={{ width: '100%', justifyContent: 'center' }}>
          {plan.cta} <span data-trailing><ArrowUpRight size={14} /></span>
        </button>
      </div>
    </div>
  );
}

/* ─────────── C — Editorial Luxury ─────────── */
function EditorialLanding() {
  const L = seedLanding;
  return (
    <div className="bb-section" style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 24px' }}>
      {/* Editorial mast */}
      <header style={{ borderTop: '2px solid var(--bb-fg)', borderBottom: '1px solid var(--bb-card-line)', padding: '20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 96 }}>
        <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 28, fontWeight: 400 }}>BuildBuy<span style={{ color: 'var(--bb-accent)' }}>.</span></div>
        <div style={{ display: 'flex', gap: 32, fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--bb-fg-muted)' }}>
          <span>Volumen 02</span><span>Otoño · 2026</span><span>Buenos Aires</span>
        </div>
      </header>

      {/* Editorial hero */}
      <div className="bb-reveal" style={{ '--i': 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 80, alignItems: 'start', marginBottom: 120 } as React.CSSProperties}>
        <div>
          <span data-eyebrow>{L.heroEyebrow}</span>
          <h1 style={{ fontSize: 'clamp(48px, 6.5vw, 104px)', whiteSpace: 'pre-line', marginTop: 24, marginBottom: 0 }}>
            Comprar <em style={{ fontStyle: 'italic' }}>materiales</em> deja de ser un cuello de botella.
          </h1>
        </div>
        <div style={{ paddingTop: 24, borderTop: '1px solid var(--bb-fg)' }}>
          <p style={{ fontSize: 17, lineHeight: 1.7, maxWidth: '38ch', marginBottom: 32, fontFamily: 'var(--bb-font-body)' }}>{L.heroSub}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="bb-btn-primary">Probar la demo</button>
            <button className="bb-btn-ghost">Plan enterprise</button>
          </div>
        </div>
      </div>

      {/* Editorial metric strip */}
      <div className="bb-reveal" style={{ '--i': 2, borderTop: '1px solid var(--bb-card-line)', borderBottom: '1px solid var(--bb-card-line)', padding: '40px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginBottom: 120 } as React.CSSProperties}>
        {[L.metric1, L.metric2, L.metric3].map((m, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? '1px solid var(--bb-card-line)' : 'none', padding: '0 32px' }}>
            <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 'clamp(48px, 6vw, 88px)', color: 'var(--bb-accent)', lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 13, marginTop: 12, color: 'var(--bb-fg-muted)', maxWidth: '20ch' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Editorial plans */}
      <div style={{ marginBottom: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--bb-fg)', paddingBottom: 16, marginBottom: 48 }}>
          <h2 style={{ fontSize: 48 }}><em>Dos</em> planes, una plataforma.</h2>
          <span data-eyebrow>Capítulo 02</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          <PlanCardEditorial plan={L.planBb} variant="bb" />
          <PlanCardEditorial plan={L.planBbPlus} variant="bbplus" />
        </div>
      </div>
    </div>
  );
}

function PlanCardEditorial({ plan, variant }: { plan: typeof seedLanding.planBb; variant: 'bb' | 'bbplus' }) {
  const isPlus = variant === 'bbplus';
  return (
    <article style={{ borderTop: '1px solid var(--bb-fg)', paddingTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <span data-eyebrow>{plan.tag}</span>
        {isPlus && <span className="bb-pill">Recomendado</span>}
      </div>
      <h3 style={{ fontSize: 56, marginBottom: 16 }}>
        {plan.name.split(' ')[0]} <em style={{ color: 'var(--bb-accent)' }}>{plan.name.split(' ').slice(1).join(' ')}</em>
      </h3>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--bb-fg-muted)', marginBottom: 32, maxWidth: '36ch' }}>{plan.desc}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px', display: 'grid', gap: 12 }}>
        {plan.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: 16, fontSize: 15, paddingBottom: 12, borderBottom: '1px solid var(--bb-card-line)', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', color: 'var(--bb-accent)', minWidth: 24 }}>{i+1}.</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button className="bb-btn-primary">{plan.cta} →</button>
    </article>
  );
}
