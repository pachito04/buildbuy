import { ITEM_SUB_STATE_COLORS, ITEM_SUB_STATES, type ItemSubState } from "@/lib/kanban-types";

interface ItemsProgressBarProps {
  items: Array<{ status: ItemSubState }>;
  variant?: 'mini' | 'full';
}

export function ItemsProgressBar({ items, variant = 'mini' }: ItemsProgressBarProps) {
  const total = items.length;
  if (total === 0) return null;

  const counts = ITEM_SUB_STATES.reduce((acc, state) => {
    acc[state] = items.filter(i => i.status === state).length;
    return acc;
  }, {} as Record<ItemSubState, number>);

  const segments = ITEM_SUB_STATES.filter(s => counts[s] > 0);

  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full ${variant === 'mini' ? 'h-1.5' : 'h-3'}`}>
        {segments.map(state => (
          <div
            key={state}
            className={ITEM_SUB_STATE_COLORS[state].bg}
            style={{ width: `${(counts[state] / total) * 100}%` }}
          />
        ))}
      </div>
      {variant === 'full' && (
        <p className="mt-1 text-xs text-muted-foreground">
          {segments.map(state => `${counts[state]} ${ITEM_SUB_STATE_COLORS[state].label.toLowerCase()}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
