import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { STORES, type Store } from "@/lib/stores";

type Ctx = { store: Store; setStoreId: (id: string) => void; stores: Store[] };

const StoreCtx = createContext<Ctx | null>(null);

/** Última tienda elegida a mano, para quienes no tienen una tienda fija (dirección). */
const CLAVE_TIENDA = "tienda-activa";

const leerGuardada = () => {
  try {
    return localStorage.getItem(CLAVE_TIENDA);
  } catch {
    return null;
  }
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [storeId, setStoreIdEstado] = useState(STORES[0]!.id);
  const store = useMemo(() => STORES.find((s) => s.id === storeId) ?? STORES[0]!, [storeId]);

  const setStoreId = (id: string) => {
    setStoreIdEstado(id);
    try {
      localStorage.setItem(CLAVE_TIENDA, id);
    } catch {
      /* sin almacenamiento local la elección dura solo esta sesión */
    }
  };

  /* Al entrar, la tienda activa es la del usuario: si no, todos partían en la primera de la
     lista (Black Pink Phone) y Vender o el lector comparaban contra la tienda equivocada. */
  useEffect(() => {
    if (!usuario) return;
    let vigente = true;

    if (!usuario.tienda_id) {
      const guardada = leerGuardada();
      if (guardada && STORES.some((s) => s.id === guardada)) setStoreIdEstado(guardada);
      return;
    }

    void supabase
      .from("tiendas")
      .select("slug")
      .eq("id", usuario.tienda_id)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente && data?.slug && STORES.some((s) => s.id === data.slug))
          setStoreIdEstado(data.slug);
      });
    return () => {
      vigente = false;
    };
  }, [usuario?.id, usuario?.tienda_id]);

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
