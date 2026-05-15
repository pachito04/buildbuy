import { useState } from "react";
import { seedComoFunciona, seedRoles, seedCasos, seedFaq } from "../seed";
import { Plus, Minus, ArrowRight } from "lucide-react";

type Variant = 'brutalist' | 'softhigh' | 'editorial';

export function LandingSections({ variant }: { variant: Variant }) {
  return (
    <>
      <ComoFunciona variant={variant} />
      <Roles variant={variant} />
      <Casos variant={variant} />
      <Faq variant={variant} />
      <Footer variant={variant} />
    </>
  );
}

function SectionTitle({ eyebrow, title, side, variant }: { eyebrow: string; title: React.ReactNode; side?: React.ReactNode; variant: Variant }) {
  if (variant === 'brutalist') {
    return (
      <>
        <div className="bb-section-eyebrow">
          <span data-eyebrow>[ {eyebrow} ]</span>
          {side && <span data-mono style={{ fontSize: 11 }}>{side}</span>}
        </div>
        <h2 className="bb-section-title">{title}</h2>
      </>
    );
  }
  if (variant === 'editorial') {
    return (
      <div style={{ borderTop: '2px solid var(--bb-fg)', paddingTop: 32, marginBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <span data-eyebrow>{eyebrow}</span>
          {side && <span data-eyebrow>{side}</span>}
        </div>
        <h2 className="bb-section-title">{title}</h2>
      </div>
    );
  }
  return (
    <div style={{ textAlign: 'center', marginBottom: 56 }}>
      <span data-eyebrow style={{ marginBottom: 16, display: 'inline-block' }}>{eyebrow}</span>
      <h2 className="bb-section-title" style={{ margin: '0 auto', fontWeight: 600 }}>{title}</h2>
    </div>
  );
}

/* ─────────── Cómo funciona ─────────── */
function ComoFunciona({ variant }: { variant: Variant }) {
  return (
    <section className="bb-landing-section" style={{ background: variant === 'softhigh' ? 'transparent' : undefined }}>
      <div className="bb-landing-section-inner">
        <SectionTitle eyebrow="cómo funciona" title={variant === 'editorial' ? <><em>4 pasos</em>, una sola pantalla.</> : 'De WhatsApp y planillas a un circuito ordenado.'} side="01 / 04" variant={variant} />

        {variant === 'brutalist' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1.5px solid var(--bb-fg)', borderRight: 'none' }}>
            {seedComoFunciona.map((p, i) => (
              <div key={p.paso} style={{ padding: 32, borderRight: '1.5px solid var(--bb-fg)', minHeight: 280, display: 'flex', flexDirection: 'column' }}>
                <div data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--bb-fg-muted)' }}>[ STEP {p.paso} ]</div>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 80, lineHeight: 1, marginTop: 24, marginBottom: 24, color: 'var(--bb-accent)' }}>{p.paso}</div>
                <h3 style={{ fontSize: 24, marginBottom: 12 }}>{p.titulo}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--bb-fg-muted)', flex: 1 }}>{p.desc}</p>
                <div data-mono style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 24, paddingTop: 16, borderTop: '1.5px solid var(--bb-fg)' }}>// ACTOR: {p.actor}</div>
              </div>
            ))}
          </div>
        ) : variant === 'editorial' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
            {seedComoFunciona.map((p, i) => (
              <article key={p.paso} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 24, paddingTop: 32, borderTop: '1px solid var(--bb-card-line)' }}>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 56, color: 'var(--bb-accent)', lineHeight: 1 }}>{p.paso}</div>
                <div>
                  <span data-eyebrow>{p.actor}</span>
                  <h3 style={{ fontSize: 28, marginTop: 4, marginBottom: 12 }}><em>{p.titulo}</em></h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {seedComoFunciona.map((p, i) => (
              <div key={p.paso} className="bb-card" style={{ padding: 28, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 24, right: 24, fontFamily: 'var(--bb-font-mono)', fontSize: 11, color: 'var(--bb-fg-soft)' }}>{p.actor}</div>
                <div style={{ width: 44, height: 44, borderRadius: 9999, background: 'var(--bb-accent-soft)', color: 'var(--bb-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--bb-font-display)', fontWeight: 600, fontSize: 18, marginBottom: 20 }}>{p.paso}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.02em' }}>{p.titulo}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--bb-fg-muted)' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────── Roles ─────────── */
function Roles({ variant }: { variant: Variant }) {
  return (
    <section className="bb-landing-section">
      <div className="bb-landing-section-inner">
        <SectionTitle eyebrow="quiénes la usan" title={variant === 'editorial' ? <>Cinco <em>roles</em>, un circuito.</> : 'Cinco roles, un solo circuito.'} side="02 / 04" variant={variant} />
        {variant === 'brutalist' ? (
          <div style={{ border: '1.5px solid var(--bb-fg)' }}>
            {seedRoles.map((r, i) => (
              <div key={r.rol} style={{ display: 'grid', gridTemplateColumns: '60px 1.4fr 1.6fr 1.6fr', borderBottom: i < seedRoles.length - 1 ? '1.5px solid var(--bb-fg)' : 'none', padding: 28, gap: 32, alignItems: 'center' }}>
                <span data-mono style={{ fontSize: 16 }}>{String(i+1).padStart(2,'0')}</span>
                <h3 style={{ fontSize: 28 }}>{r.rol.toUpperCase()}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>{r.desc}</p>
                <div data-mono style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--bb-fg-muted)' }}>// {r.detalle}</div>
              </div>
            ))}
          </div>
        ) : variant === 'editorial' ? (
          <div>
            {seedRoles.map((r, i) => (
              <article key={r.rol} style={{ display: 'grid', gridTemplateColumns: '80px 2fr 2fr 1.4fr', gap: 32, padding: '28px 0', borderBottom: '1px solid var(--bb-card-line)', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 40, color: 'var(--bb-accent)' }}>{String(i+1).padStart(2,'0')}.</span>
                <h3 style={{ fontSize: 32 }}><em>{r.rol}</em></h3>
                <p style={{ fontSize: 15, lineHeight: 1.6 }}>{r.desc}</p>
                <span data-eyebrow>{r.detalle}</span>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {seedRoles.map((r, i) => (
              <div key={r.rol} className="bb-card" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
                <span data-eyebrow style={{ marginBottom: 16 }}>{String(i+1).padStart(2,'0')} · rol</span>
                <h3 style={{ fontSize: 22, fontWeight: 600, marginBottom: 10, letterSpacing: '-0.02em' }}>{r.rol}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--bb-fg-muted)', flex: 1 }}>{r.desc}</p>
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bb-card-line)', fontSize: 12, fontFamily: 'var(--bb-font-mono)', color: 'var(--bb-fg-soft)' }}>{r.detalle}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────── Casos ─────────── */
function Casos({ variant }: { variant: Variant }) {
  return (
    <section className="bb-landing-section">
      <div className="bb-landing-section-inner">
        <SectionTitle eyebrow="quién la está usando" title={variant === 'editorial' ? <><em>Constructoras</em> que ya no vuelven atrás.</> : 'Constructoras que ya no vuelven atrás.'} side="03 / 04" variant={variant} />
        {variant === 'brutalist' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1.5px solid var(--bb-fg)' }}>
            {seedCasos.map((c, i) => (
              <div key={c.cliente} style={{ padding: 32, borderRight: i < 2 ? '1.5px solid var(--bb-fg)' : 'none', minHeight: 320, display: 'flex', flexDirection: 'column', background: 'var(--bb-card)' }}>
                <div data-mono style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--bb-fg-muted)', marginBottom: 8 }}>[ CASO / 0{i+1} ]</div>
                <h3 style={{ fontSize: 28, marginBottom: 8 }}>{c.cliente.toUpperCase()}</h3>
                <div data-mono style={{ fontSize: 11, color: 'var(--bb-fg-muted)', marginBottom: 24 }}>{c.sector.toUpperCase()} · {c.obras} OBRAS</div>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 36, color: 'var(--bb-accent)', marginBottom: 24, lineHeight: 1 }}>{c.metric}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, flex: 1, fontStyle: 'italic' }}>&laquo; {c.quote} &raquo;</p>
              </div>
            ))}
          </div>
        ) : variant === 'editorial' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
            {seedCasos.map((c, i) => (
              <article key={c.cliente} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 64, padding: '40px 0', borderBottom: '1px solid var(--bb-card-line)', alignItems: 'center' }}>
                <div>
                  <span data-eyebrow>{c.sector} · {c.obras} obras</span>
                  <h3 style={{ fontSize: 56, marginTop: 12, marginBottom: 16 }}><em>{c.cliente}</em></h3>
                  <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: '40ch', fontStyle: 'italic' }}>&laquo; {c.quote} &raquo;</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span data-eyebrow>resultado</span>
                  <div style={{ fontFamily: 'var(--bb-font-display)', fontStyle: 'italic', fontSize: 'clamp(48px, 5vw, 80px)', color: 'var(--bb-accent)', lineHeight: 1, marginTop: 8 }}>{c.metric}</div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {seedCasos.map((c, i) => (
              <div key={c.cliente} className="bb-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
                <span data-eyebrow>{c.sector}</span>
                <h3 style={{ fontSize: 22, fontWeight: 600, marginTop: 8, marginBottom: 8, letterSpacing: '-0.02em' }}>{c.cliente}</h3>
                <span style={{ fontSize: 12, color: 'var(--bb-fg-soft)', marginBottom: 20 }}>{c.obras} obras gestionadas</span>
                <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 36, color: 'var(--bb-accent)', fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 24, lineHeight: 1 }}>{c.metric}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--bb-fg-muted)', flex: 1, fontStyle: 'italic' }}>&laquo; {c.quote} &raquo;</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────── FAQ ─────────── */
function Faq({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bb-landing-section">
      <div className="bb-landing-section-inner">
        <SectionTitle eyebrow="preguntas frecuentes" title={variant === 'editorial' ? <>Lo que <em>siempre</em> nos preguntan.</> : 'Lo que siempre nos preguntan.'} side="04 / 04" variant={variant} />
        <div style={{ maxWidth: 880, margin: variant === 'softhigh' ? '0 auto' : '0', border: variant === 'brutalist' ? '1.5px solid var(--bb-fg)' : 'none' }}>
          {seedFaq.map((f, i) => (
            <div key={i} style={{ borderBottom: i < seedFaq.length - 1 ? (variant === 'brutalist' ? '1.5px solid var(--bb-fg)' : '1px solid var(--bb-card-line)') : (variant === 'brutalist' ? 'none' : '1px solid var(--bb-card-line)'), borderTop: i === 0 && variant !== 'brutalist' ? '1px solid var(--bb-card-line)' : 'none' }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 24px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
                <span style={{ fontSize: variant === 'editorial' ? 22 : 18, fontWeight: variant === 'editorial' ? 400 : 500, fontStyle: variant === 'editorial' ? 'italic' : 'normal' }}>{f.q}</span>
                {open === i ? <Minus size={20} /> : <Plus size={20} />}
              </button>
              {open === i && (
                <div style={{ padding: '0 24px 24px', maxWidth: '70ch' }}>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--bb-fg-muted)' }}>{f.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Footer + final CTA ─────────── */
function Footer({ variant }: { variant: Variant }) {
  return (
    <section className="bb-landing-section" style={{ paddingTop: variant === 'brutalist' ? 0 : 64 }}>
      <div className="bb-landing-section-inner">
        <div style={{
          background: variant === 'editorial' ? 'transparent' : 'var(--bb-fg)',
          color: variant === 'editorial' ? 'inherit' : 'var(--bb-bg)',
          padding: variant === 'editorial' ? 0 : 64,
          borderRadius: variant === 'brutalist' ? 0 : 'var(--bb-radius-lg)',
          borderTop: variant === 'editorial' ? '2px solid var(--bb-fg)' : 'none',
          paddingTop: variant === 'editorial' ? 64 : undefined,
          textAlign: variant === 'softhigh' ? 'center' : 'left',
        }}>
          <span data-eyebrow style={{ color: variant === 'editorial' ? undefined : 'rgba(255,255,255,0.5)' }}>último capítulo</span>
          <h2 style={{ fontSize: 'clamp(40px, 5vw, 72px)', marginTop: 16, marginBottom: 32, maxWidth: variant === 'softhigh' ? '18ch' : '20ch', margin: variant === 'softhigh' ? '16px auto 32px' : '16px 0 32px' }}>
            {variant === 'editorial' ? <>Ordenar tu compra de obra es una decisión <em>de gestión</em>.</> : 'Ordenar tu compra de obra es una decisión de gestión.'}
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: '48ch', marginBottom: 32, opacity: 0.85, margin: variant === 'softhigh' ? '0 auto 32px' : '0 0 32px' }}>
            Probá la demo, recorré la plataforma, y agendá una reunión cuando quieras profundizar.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: variant === 'softhigh' ? 'center' : 'flex-start' }}>
            <button className={variant === 'editorial' ? 'bb-btn-primary' : 'bb-btn-primary'} style={variant !== 'editorial' ? { background: 'var(--bb-accent)', color: '#fff', border: 'none' } : undefined}>
              Probar la demo {variant !== 'brutalist' && '→'}
            </button>
            <button className="bb-btn-ghost" style={variant !== 'editorial' ? { color: 'var(--bb-bg)', borderColor: 'rgba(255,255,255,0.3)' } : undefined}>
              Hablar con ventas
            </button>
          </div>
        </div>

        {/* Real footer */}
        <footer style={{ marginTop: 64, paddingTop: 32, borderTop: variant === 'brutalist' ? '1.5px solid var(--bb-fg)' : '1px solid var(--bb-card-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ fontFamily: 'var(--bb-font-display)', fontSize: 22, fontWeight: variant === 'editorial' ? 400 : 700, fontStyle: variant === 'editorial' ? 'italic' : 'normal' }}>
            BuildBuy<span style={{ color: 'var(--bb-accent)' }}>·</span>
          </div>
          <div style={{ display: 'flex', gap: 32, fontSize: 12, fontFamily: 'var(--bb-font-mono)', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--bb-fg-muted)', flexWrap: 'wrap' }}>
            <span>Producto</span><span>Planes</span><span>Casos</span><span>Empresa</span><span>Contacto</span>
          </div>
          <div data-mono style={{ fontSize: 11, color: 'var(--bb-fg-soft)' }}>© 2026 BuildBuy · Buenos Aires</div>
        </footer>
      </div>
    </section>
  );
}
