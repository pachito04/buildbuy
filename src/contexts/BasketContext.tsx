import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface BasketItem {
  material_id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface BasketContextType {
  items: BasketItem[];
  addItem: (item: Omit<BasketItem, "quantity">, quantity: number) => void;
  removeItem: (materialId: string) => void;
  updateQuantity: (materialId: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
}

const STORAGE_KEY = "buildbuy-basket";

const BasketContext = createContext<BasketContextType | null>(null);

function loadBasket(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>(loadBasket);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<BasketItem, "quantity">, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.material_id === item.material_id);
      if (existing) {
        return prev.map((i) =>
          i.material_id === item.material_id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const removeItem = useCallback((materialId: string) => {
    setItems((prev) => prev.filter((i) => i.material_id !== materialId));
  }, []);

  const updateQuantity = useCallback((materialId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.material_id !== materialId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.material_id === materialId ? { ...i, quantity } : i))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + 1, 0);

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
