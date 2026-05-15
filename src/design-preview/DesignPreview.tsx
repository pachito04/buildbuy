import { useState } from "react";
import "./variants.css";
import { LandingHero } from "./screens/LandingHero";
import { DashboardScreen } from "./screens/Dashboard";
import { InventarioScreen } from "./screens/Inventario";
import { KanbanScreen } from "./screens/Kanban";

type Variant = 'brutalist' | 'softhigh' | 'editorial';
type Screen = 'landing' | 'dashboard' | 'inventario' | 'kanban';

const VARIANTS: { id: Variant; label: string; tag: string; mood: string }[] = [
  { id: 'brutalist', label: 'A · Industrial Brutalist', tag: 'Swiss print × Tactical', mood: 'concreto + acero + naranja como hazard red, grids visibles, ASCII framing' },
  { id: 'softhigh', label: 'B · High-End Soft',         tag: 'Linear / Vercel core',  mood: 'minimal premium, doppelrand cards, naranja desaturado, mucho aire' },
  { id: 'editorial', label: 'C · Editorial Luxury',      tag: 'Wallpaper × Construction', mood: 'cream cálido, serif itálico, grain, naranja burnt' },
];

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'landing', label: 'Landing' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'kanban', label: 'Requerimientos · Kanban' },
];

export default function DesignPreview() {
  const [variant, setVariant] = useState<Variant>('brutalist');
  const [screen, setScreen] = useState<Screen>('landing');

  return (
    <div style={{ minHeight: '100dvh' }}>
      <PreviewToolbar variant={variant} screen={screen} onVariant={setVariant} onScreen={setScreen} />
      <div className={`bb-preview bb-preview--${variant}`}>
        {screen === 'landing' && <LandingHero variant={variant} />}
        {screen === 'dashboard' && <DashboardScreen variant={variant} />}
        {screen === 'inventario' && <InventarioScreen variant={variant} />}
        {screen === 'kanban' && <KanbanScreen variant={variant} />}
      </div>
    </div>
  );
}

function PreviewToolbar({
  variant, screen, onVariant, onScreen,
}: {
  variant: Variant; screen: Screen;
  onVariant: (v: Variant) => void; onScreen: (s: Screen) => void;
}) {
  const current = VARIANTS.find(v => v.id === variant)!;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#0F0F0F', color: '#E8E6E0',
      borderBottom: '1px solid #2A2926',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system',
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 20px', borderBottom: '1px solid #2A2926', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>BuildBuy<span style={{ color: '#E55D1F' }}>·</span>Design Preview</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1F1F1B', color: '#9E9C95', textTransform: 'uppercase', letterSpacing: '0.12em' }}>v1 · draft</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9E9C95', maxWidth: 480 }}>{current.mood}</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', alignItems: 'stretch', borderBottom: '1px solid #2A2926' }}>
        <span style={{ alignSelf: 'center', fontSize: 11, color: '#6E6C66', textTransform: 'uppercase', letterSpacing: '0.16em', marginRight: 16 }}>Variante</span>
        {VARIANTS.map(v => (
          <button key={v.id} onClick={() => onVariant(v.id)} style={{
            padding: '12px 18px',
            background: variant === v.id ? '#E55D1F' : 'transparent',
            color: variant === v.id ? '#FFF' : '#E8E6E0',
            border: 'none',
            borderRight: '1px solid #2A2926',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: variant === v.id ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 200ms',
          }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.7 }}>{v.id === 'brutalist' ? 'A' : v.id === 'softhigh' ? 'B' : 'C'}</span>
            <span>{v.label.split('·')[1].trim()}</span>
            <span style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.12em', marginLeft: 4 }}>{v.tag}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', alignItems: 'stretch' }}>
        <span style={{ alignSelf: 'center', fontSize: 11, color: '#6E6C66', textTransform: 'uppercase', letterSpacing: '0.16em', marginRight: 16 }}>Pantalla</span>
        {SCREENS.map(s => (
          <button key={s.id} onClick={() => onScreen(s.id)} style={{
            padding: '10px 16px',
            background: screen === s.id ? '#1F1F1B' : 'transparent',
            color: screen === s.id ? '#FFF' : '#9E9C95',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            borderBottom: screen === s.id ? '2px solid #E55D1F' : '2px solid transparent',
          }}>
            {s.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <a href="/" style={{
          alignSelf: 'center',
          fontSize: 11, color: '#9E9C95',
          textDecoration: 'none',
          textTransform: 'uppercase', letterSpacing: '0.14em',
        }}>← volver a la app</a>
      </div>
    </div>
  );
}
