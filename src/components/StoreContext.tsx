import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { STORES, type Store } from "@/lib/stores";

type Ctx = { store: Store; setStoreId: (id: string) => void; stores: Store[] };

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState(STORES[0]!.id);
  const store = useMemo(() => STORES.find((s) => s.id === storeId) ?? STORES[0]!, [storeId]);

  return (
    <StoreCtx.Provider value={{ store, setStoreId, stores: STORES }}>
      <div
        className="contents"
        style={
          {
            "--accent-store": store.accent,
            "--accent-store-soft": store.accentSoft,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore debe usarse dentro de StoreProvider");
  return ctx;
}
