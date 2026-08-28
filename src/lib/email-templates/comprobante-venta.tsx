import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import type { TemplateEntry } from "./registry";

interface Linea {
  descripcion?: string;
  detalle?: string;
  monto?: number;
}

interface Props {
  numero?: string;
  fecha?: string;
  tienda?: string;
  cliente?: string;
  total?: number;
  recargo?: number;
  lineas?: Linea[];
  pagos?: { metodo?: string; monto?: number }[];
  url?: string;
}

const clp = (n?: number) =>
  "$" + new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Math.round(n ?? 0));

const Email = ({
  numero = "—",
  fecha = "",
  tienda = "iPhonizate OS",
  cliente,
  total = 0,
  recargo = 0,
  lineas = [],
  pagos = [],
  url,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{`Comprobante ${numero} · ${tienda}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{tienda}</Text>
        <Heading style={h1}>Comprobante {numero}</Heading>
        <Text style={muted}>
          {fecha ? `Fecha: ${fecha}` : null}
          {cliente ? `${fecha ? " · " : ""}Cliente: ${cliente}` : null}
        </Text>

        <Hr style={hr} />

        <Section>
          {lineas.map((l, i) => (
            <Section key={i} style={{ marginBottom: "10px" }}>
              <Text style={itemTitulo}>{l.descripcion ?? "Ítem"}</Text>
              {l.detalle ? <Text style={itemDetalle}>{l.detalle}</Text> : null}
              <Text style={itemMonto}>{clp(l.monto)}</Text>
            </Section>
          ))}
          {recargo > 0 ? (
            <Text style={itemTitulo}>Recargo boleta: {clp(recargo)}</Text>
          ) : null}
        </Section>

        <Hr style={hr} />

        <Text style={totalTexto}>Total: {clp(total)}</Text>

        {pagos.length > 0 ? (
          <Text style={muted}>
            Pagos: {pagos.map((p) => `${p.metodo ?? "pago"} ${clp(p.monto)}`).join(" · ")}
          </Text>
        ) : null}

        {url ? (
          <Text style={{ ...muted, marginTop: "20px" }}>
            Descargar el comprobante en PDF:{" "}
            <Link href={url} style={link}>
              ver comprobante
            </Link>
          </Text>
        ) : null}

        <Text style={pie}>
          Gracias por tu compra en {tienda}. Guarda este comprobante para cualquier gestión de
          garantía.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Comprobante ${d?.numero ?? ""} · ${d?.tienda ?? "iPhonizate"}`,
  displayName: "Comprobante de venta",
  previewData: {
    numero: "BPP-000124",
    fecha: "28-08-2026",
    tienda: "Black Pink Phone",
    cliente: "Renato Soto",
    total: 749990,
    recargo: 0,
    lineas: [
      { descripcion: "iPhone 13 128GB Medianoche", detalle: "IMEI 356789104512345", monto: 699990 },
      { descripcion: "Cable USB-C", detalle: "Accesorio", monto: 50000 },
    ],
    pagos: [{ metodo: "Débito", monto: 749990 }],
    url: "https://iphonizate.app",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const eyebrow = {
  fontSize: "12px",
  letterSpacing: "1px",
  textTransform: "uppercase" as const,
  color: "#8B5CF6",
  margin: "0 0 4px",
};
const h1 = { fontSize: "22px", color: "#16131F", margin: "0 0 6px" };
const muted = { fontSize: "13px", color: "#6b7280", margin: "0 0 4px" };
const hr = { borderColor: "#e5e7eb", margin: "18px 0" };
const itemTitulo = { fontSize: "14px", color: "#16131F", margin: "0", fontWeight: 600 };
const itemDetalle = { fontSize: "12px", color: "#6b7280", margin: "2px 0 0" };
const itemMonto = { fontSize: "14px", color: "#16131F", margin: "2px 0 0" };
const totalTexto = { fontSize: "18px", fontWeight: 700, color: "#16131F", margin: "0 0 6px" };
const link = { color: "#8B5CF6" };
const pie = { fontSize: "12px", color: "#9ca3af", marginTop: "24px" };
