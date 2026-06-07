import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { basketLineId, mergeBasketItem } from "@/lib/basket-utils";

// Re-export so callers can import BasketItem from either location.
export type { BasketItem } from "@/lib/basket-utils";

import type { BasketItem } from "@/lib/basket-utils";

interface AddItemInput {
  material_id: string;
  name: string;
  unit: string;
  // Optional traceability fields — defaults: origen="Libre", request_id/request_item_id = null
  origen?: string;
  request_id?: string | null;
  request_item_id?: string | null;
}

interface BasketContextType {
  items: BasketItem[];
  addItem: (item: AddItemInput, quantity: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
}

const STORAGE_KEY = "buildbuy-basket";

const BasketContext = createContext<BasketContextType | null>(null);

/** Sanitize persisted items that may be missing the new fields (migration-safe). */
function sanitize(raw: unknown[]): BasketItem[] {
  return raw.map((item: any) => {
    const request_item_id = item.request_item_id ?? null;
    return {
      material_id: item.material_id ?? "",
      name: item.name ?? "",
      unit: item.unit ?? "",
      quantity: Number(item.quantity) || 0,
      origen: item.origen ?? "Libre",
      request_id: item.request_id ?? null,
      request_item_id,
      // Derive id if missing (old localStorage format)
      id: item.id ?? basketLineId(item.material_id ?? "", request_item_id),
    };
  });
}

function loadBasket(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitize(parsed) : [];
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>(loadBasket);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((input: AddItemInput, quantity: number) => {
    const request_item_id = input.request_item_id ?? null;
    const incoming: BasketItem = {
      id: basketLineId(input.material_id, request_item_id),
      material_id: input.material_id,
      name: input.name,
      unit: input.unit,
      quantity,
      origen: input.origen ?? "Libre",
      request_id: input.request_id ?? null,
      request_item_id,
    };
    setItems((prev) => mergeBasketItem(prev, incoming));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  // totalItems = number of lines (same as before)
  const totalItems = items.length;

  return (
    <BasketContext.Provider value={{ items, addItem, removeItem, updateQuantity, clear, totalItems }}>
      {children}
    </BasketContext.Provider>
  );
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error("useBasket must be used within BasketProvider");
  return ctx;
}
