# Lovable Interface

INTERFAZ Y LENGUAJE VISUAL

Español de Chile. CLP sin decimales, formato $1.234.567.

Estética: glassmorphism premium, elegante y con profundidad. Nunca aspecto de plantilla.

Fondo base #0F0D17, con un gradiente radial sutil encima: violeta #5B3DE0 al 10% arriba

a la izquierda y rosa #EC4899 al 6% abajo a la derecha. Ese gradiente es lo que el vidrio

difumina; sin él el efecto no se ve.

Superficies de vidrio (sidebar, barra superior, modales, tarjetas de métricas, popovers):

fondo rgba(255,255,255,0.05), backdrop-blur de 24px, borde 1px rgba(255,255,255,0.08),

sombra suave y difusa hacia abajo. Radio 16px.

Tablas de datos: superficie SÓLIDA #16131F, sin blur, alto contraste, filas densas con

hover sutil. La legibilidad manda por sobre el efecto. Radio 12px.

Tipografía: Poppins para títulos y cifras, Inter para cuerpo e interfaz.

Todas las columnas numéricas usan tabular-nums para que las cifras queden alineadas.

El color de acento lo define la tienda activa y recorre toda la interfaz, incluido un

glow suave detrás de los elementos activos del sidebar:

Black Pink Phone #EC4899 · Riffstore #8B5CF6 · iPhonizate #F59E0B · Bodega #64748B

Transiciones de 200ms en hover y focus. Nada de animaciones largas ni rebotes.

Escritorio primero: sidebar fijo y tablas densas. Responsive desde 900px con nav inferior.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://iphonizate.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d0515a9e-cd6a-4c8b-92ff-7ff7a4dd1654).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
