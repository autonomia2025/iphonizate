import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, LockKeyhole, User } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ingresar · iPhonizate OS" },
      {
        name: "description",
        content:
          "Ingreso al panel de operaciones iPhonizate OS con usuario y PIN de 6 dígitos.",
      },
      { property: "og:title", content: "Ingresar · iPhonizate OS" },
      {
        property: "og:description",
        content: "Panel de operaciones multitienda de iPhones usados en Chile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PantallaIngreso,
});

function PantallaIngreso() {
  const { usuario, cargando, ingresar, cambiarPin } = useAuth();
  const { store } = useStore();
  const router = useRouter();

  const [nombreUsuario, setNombreUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinRepetido, setPinRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const debeCambiar = !!usuario?.debe_cambiar_pin;

  useEffect(() => {
    if (usuario && !usuario.debe_cambiar_pin) {
      void router.navigate({ to: "/", replace: true });
    }
  }, [usuario, router]);

  const enviarIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await ingresar(nombreUsuario, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ingresar");
    } finally {
      setEnviando(false);
      setPin("");
    }
  };

  const enviarCambio = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pinNuevo !== pinRepetido) {
      setError("Los PIN no coinciden");
      return;
    }
    setEnviando(true);
    try {
      await cambiarPin(pinNuevo);
      await router.navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el PIN");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-sm p-7">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-background"
            style={{ background: store.accent, boxShadow: `0 0 22px -6px ${store.hex}` }}
          >
            r
          </span>
          <span className="font-display text-[16px] font-semibold leading-tight tracking-tight">
            iPhonizate <span style={{ color: store.accent }}>OS</span>
          </span>
        </div>

        {cargando ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando sesión…
          </div>
        ) : debeCambiar ? (
          <form onSubmit={enviarCambio} className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-lg font-semibold">Cambia tu PIN</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Hola {usuario?.nombre}. Tu PIN es provisorio, define uno nuevo de 6 dígitos.
              </p>
            </div>
            <Campo
              icono={<LockKeyhole className="size-4" />}
              etiqueta="PIN nuevo"
              value={pinNuevo}
              onChange={setPinNuevo}
              pin
            />
            <Campo
              icono={<LockKeyhole className="size-4" />}
              etiqueta="Repite el PIN"
              value={pinRepetido}
              onChange={setPinRepetido}
              pin
            />
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            <Boton enviando={enviando} accent={store.accent}>
              Guardar PIN y entrar
            </Boton>
          </form>
        ) : (
          <form onSubmit={enviarIngreso} className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-lg font-semibold">Ingresar</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Usa tu usuario y tu PIN de 6 dígitos.
              </p>
            </div>
            <Campo
              icono={<User className="size-4" />}
              etiqueta="Usuario"
              value={nombreUsuario}
              onChange={setNombreUsuario}
              autoFocus
            />
            <Campo
              icono={<KeyRound className="size-4" />}
              etiqueta="PIN"
              value={pin}
              onChange={setPin}
              pin
            />
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            <Boton enviando={enviando} accent={store.accent}>
              Entrar
            </Boton>
            <p className="text-[11px] text-muted-foreground">
              Tras 5 intentos fallidos la cuenta se bloquea por 15 minutos.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Campo({
  icono,
  etiqueta,
  value,
  onChange,
  pin,
  autoFocus,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
  pin?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {etiqueta}
      </span>
      <span className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-colors focus-within:border-white/20">
        <span className="text-muted-foreground">{icono}</span>
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) =>
            onChange(pin ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)
          }
          type={pin ? "password" : "text"}
          inputMode={pin ? "numeric" : "text"}
          autoComplete={pin ? "off" : "username"}
          className={
            "w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" +
            (pin ? " font-display tracking-[0.35em] tabular-nums" : "")
          }
          placeholder={pin ? "••••••" : "usuario"}
        />
      </span>
    </label>
  );
}

function Boton({
  enviando,
  accent,
  children,
}: {
  enviando: boolean;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={enviando}
      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-medium text-background transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
      style={{ background: accent }}
    >
      {enviando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
