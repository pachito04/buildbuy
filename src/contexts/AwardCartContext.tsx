import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface AwardCartItem {
  quote_item_id: string;
  rfq_id: string;
  rfq_item_id: string;
  provider_id: string;
  provider_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

interface AwardCartContextType {
  items: AwardCartItem[];
  addItem: (item: AwardCartItem) => void;
  removeItem: (quoteItemId: string) => void;
  removeByProvider: (providerId: string) => void;
  clear: () => void;
  isAwarded: (quoteItemId: string) => boolean;
  totalItems: number;
}

const STORAGE_KEY = "buildbuy-award-cart";

const AwardCartContext = createContext<AwardCartContextType | null>(null);

function loadCart(): AwardCartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function AwardCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AwardCartItem[]>(loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: AwardCartItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.quote_item_id === item.quote_item_id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((quoteItemId: string) => {
    setItems((prev) => prev.filter((i) => i.quote_item_id !== quoteItemId));
  }, []);

  const removeByProvider = useCallback((providerId: string) => {
    setItems((prev) => prev.filter((i) => i.provider_id !== providerId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const isAwarded = useCallback(
    (quoteItemId: string) => items.some((i) => i.quote_item_id === quoteItemId),
    [items]
  );

  return (
    <AwardCartContext.Provider value={{ items, addItem, removeItem, removeByProvider, clear, isAwarded, totalItems: items.length }}>
      {children}
    </AwardCartContext.Provider>
  );
}

export function useAwardCart() {
  const ctx = useContext(AwardCartContext);
  if (!ctx) throw new Error("useAwardCart must be used within AwardCartProvider");
  return ctx;
}
