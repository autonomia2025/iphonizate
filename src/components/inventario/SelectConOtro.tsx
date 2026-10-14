import { useEffect, useState } from "react";

const OTRO = "__otro__";

/**
 * Lista de opciones con "Otro (escribir)" al final para lo que todavía no está en el catálogo.
 * Si el valor actual no está en la lista (por ejemplo, lo trajo el lector USB), se muestra
 * en el campo de texto en vez de perderse.
 */
export function SelectConOtro({
  id,
  value,
  onChange,
  opciones,
  placeholder,
  otroPlaceholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  placeholder: string;
  otroPlaceholder: string;
  className: string;
}) {
  const fueraDeLista = !!value && !opciones.includes(value);
  const [escribiendo, setEscribiendo] = useState(fueraDeLista);

  useEffect(() => {
    if (fueraDeLista) setEscribiendo(true);
  }, [fueraDeLista]);

  return (
    <>
      <select
        id={id}
        className={className}
        value={escribiendo ? OTRO : value}
        onChange={(e) => {
          if (e.target.value === OTRO) {
            setEscribiendo(true);
            onChange("");
          } else {
            setEscribiendo(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTRO}>Otro (escribir)</option>
      </select>
      {escribiendo && (
        <input
          autoFocus={!fueraDeLista}
          aria-label={otroPlaceholder}
          className={`${className} mt-1.5`}
          placeholder={otroPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
