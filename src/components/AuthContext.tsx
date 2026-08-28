import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRol } from "@/lib/nav";

export type UsuarioSesion = {
  id: string;
  nombre: string;
  usuario: string;
  rol: AppRol;
  tienda_id: string | null;
  debe_cambiar_pin: boolean;
};

type Ctx = {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  refrescar: () => Promise<void>;
  ingresar: (usuario: string, pin: string) => Promise<void>;
  cambiarPin: (pinNuevo: string) => Promise<void>;
  salir: () => Promise<void>;
};

// Se reutiliza la misma instancia entre recargas en caliente (HMR): si se creara
// un contexto nuevo, el proveedor montado quedaría en la instancia antigua y
// useAuth lanzaría "debe usarse dentro de AuthProvider" con pantalla en blanco.
const globalAuth = globalThis as { __authCtx?: React.Context<Ctx | null> };
const AuthCtx = globalAuth.__authCtx ?? createContext<Ctx | null>(null);
globalAuth.__authCtx = AuthCtx;

async function cargarUsuario(): Promise<UsuarioSesion | null> {
  const { data: sesion } = await supabase.auth.getSession();
  if (!sesion.session) return null;
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, usuario, rol, tienda_id, debe_cambiar_pin")
    .eq("auth_user_id", sesion.session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as UsuarioSesion;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = async () => {
    setUsuario(await cargarUsuario());
    setCargando(false);
  };

  useEffect(() => {
    void refrescar();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        void refrescar();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const ingresar = async (nombreUsuario: string, pin: string) => {
    const { data, error } = await supabase.rpc("login_lookup", {
      _usuario: nombreUsuario.trim(),
      _pin: pin,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    const fila = Array.isArray(data) ? data[0] : data;
    const email = (fila as { email_interno?: string } | null)?.email_interno;
    if (!email) throw new Error("Usuario o PIN incorrecto");

    const { error: errIngreso } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });
    if (errIngreso) throw new Error("Usuario o PIN incorrecto");
    await refrescar();
  };

  const cambiarPin = async (pinNuevo: string) => {
    if (!/^\d{6}$/.test(pinNuevo)) throw new Error("El PIN debe tener 6 dígitos");
    const { error: errAuth } = await supabase.auth.updateUser({ password: pinNuevo });
    if (errAuth && !/different from the old password/i.test(errAuth.message)) {
      throw new Error(
        /weak|pwned|leaked/i.test(errAuth.message)
          ? "Ese PIN es demasiado común, prueba otra combinación"
          : errAuth.message,
      );
    }

    const { error } = await supabase.rpc("cambiar_pin", { _pin_nuevo: pinNuevo });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    await refrescar();
  };

  const salir = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
  };

  /* Cierre por inactividad a las 12 horas: cubre el turno completo sin cortar la jornada */
  useEffect(() => {
    if (!usuario) return;
    let temporizador: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => void salir(), INACTIVIDAD_MS);
    };
    const eventos = ["pointerdown", "keydown", "wheel", "visibilitychange"] as const;
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();
    return () => {
      clearTimeout(temporizador);
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, [usuario]);


  return (
    <AuthCtx.Provider value={{ usuario, cargando, refrescar, ingresar, cambiarPin, salir }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
