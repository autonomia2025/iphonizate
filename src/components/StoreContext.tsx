import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { STORES, type Store } from "@/lib/stores";

type Ctx = { store: Store; setStoreId: (id: string) => void; stores: Store[] };

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState(STORES[0]!.id);
  const store = useMemo(() => STORES.find((s) => s.id === storeId) ?? STORES[0]!, [storeId]);

  /* Se aplica en <html> para que el cambio de acento transicione suavemente
     por toda la interfaz (ver `transition: --accent-store` en styles.css). */
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--accent-store", store.hex);
    raiz.style.setProperty("--accent-store-soft", `${store.hex}2e`);
  }, [store]);

  return (
    <StoreCtx.Provider value={{ store, setStoreId, stores: STORES }}>{children}</StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore debe usarse dentro de StoreProvider");
  return ctx;
}
