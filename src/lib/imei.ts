/**
 * Validación local del IMEI. No depende de ningún servicio externo.
 */

/**
 * Dígito verificador del IMEI (algoritmo de Luhn). Un IMEI que no pasa Luhn no
 * existe, así que sirve para atajar errores de digitación al ingresar.
 */
export function luhnValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let suma = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}
