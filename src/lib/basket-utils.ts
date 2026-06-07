export interface BasketItem {
  id: string;                   // basketLineId(material_id, request_item_id)
  material_id: string;
  name: string;
  unit: string;
  quantity: number;
  origen: string;               // "Requerimiento #42" | "Libre"
  request_id: string | null;
  request_item_id: string | null;
}

/**
 * Produces a stable line key: same material + same origin → same key (lines merge).
 * Different origins of the same material produce distinct keys (separate lines).
 */
export function basketLineId(
  material_id: string,
  request_item_id: string | null
): string {
  return `${material_id}::${request_item_id ?? "libre"}`;
}

/**
 * Pure merge: if an item with the same id already exists, accumulate quantity;
 * otherwise append at the end. Never mutates the input array.
 */
export function mergeBasketItem(
  items: BasketItem[],
  incoming: BasketItem
): BasketItem[] {
  const idx = items.findIndex((i) => i.id === incoming.id);
  if (idx === -1) {
    return [...items, incoming];
  }
  return items.map((i, index) =>
    index === idx ? { ...i, quantity: i.quantity + incoming.quantity } : i
  );
}
