# Faltaenvidoytruco · Truco entre amigos

Truco online para 2, 4 o 6 jugadores. La aplicación abre en la sala de mesas: entrar a una pública, crear una privada, compartir un código o jugar contra bots. Baraja española clásica de 40 cartas.

Versión publicada: [faltaenvidoytruco.vercel.app](https://faltaenvidoytruco.vercel.app). La producción usa Postgres de Supabase para las mesas y el historial.

## Ejecutar

Requiere Node.js 24 y pnpm. Con npm también se pueden ejecutar los scripts.

```sh
pnpm install
pnpm dev
```

Abrir http://localhost:5173. Vite redirige `/api` al servidor en el puerto 3001 (no hay WebSockets: el cliente consulta `/api/game` por HTTP, con sondeo corto). Para probar entre dispositivos en la misma red, abrir la dirección IP del equipo en el puerto 5173 y permitir ambos procesos en el firewall si corresponde. Sin `DATABASE_URL`, el servidor guarda las mesas y el historial en `.data/truco.sqlite` (SQLite local).

```sh
pnpm test
pnpm build
pnpm start
```

En producción el servidor sirve `dist` y la API desde el mismo origen. `PORT` cambia el puerto (3001 por defecto). En Vercel, `api/game.ts` corre como función serverless y necesita `SUPABASE_DB_URL` apuntando a Postgres — ver "Desplegar" más abajo.

## Incluido

- Salas privadas por código aleatorio de 10 caracteres y link, mesas públicas con lista en vivo, nombres, equipos alternados 1v1 / 2v2 / 3v3 y chat. Se aceptan códigos anteriores de seis caracteres para no interrumpir partidas ya creadas.
- Partidas a 15 o 30, jerarquía argentina, bazas y pardas, envido / real / falta, truco / retruco / vale cuatro, al mazo y rotación de mano.
- Envido puede interrumpir el primer truco; empates de tanto se resuelven por mano.
- Asientos y turnos en sentido antihorario, hacia la derecha. La mesa se ajusta a la altura de la pantalla; la primera carta de cada jugador va hacia el centro y las siguientes avanzan por su brazo de la cruz hacia el asiento. Los botones para cantar quedan dentro del tablero. Los carteles anuncian cantos, tantos, puntos y el resultado de la mano. La siguiente mano se reparte sola. Las respuestas atrasadas no hacen retroceder la mesa.
- Práctica local y bots para completar salas. Los bots son básicos: no pretenden simular un jugador experto.
- Servidor autoritativo con barajado criptográfico. Cada cliente recibe únicamente su mano, sus tantos y el estado público.
- Persistencia en Postgres (Supabase en producción) o SQLite local: las mesas sobreviven a un reinicio del servidor y cada partida terminada queda archivada.
- Perfil por jugador (clave privada guardada en el navegador, exportable/recuperable) con historial de partidas, resultado, rivales frecuentes y repaso mano por mano de las cartas y cantos.
- Reconexión automática: la identidad depende de la clave del navegador, no de una sesión de socket, así que recargar la página no saca a nadie de la mesa.
- Interfaz adaptable en crema y azul con un ornamento discreto, anotador dividido en malas y buenas, botones accesibles, diálogos nativos, sonidos opcionales y movimiento reducido.
- Efectos de cartas de [54 Casino sound effects](https://opengameart.org/node/12742) de Kenney (CC0). Música opcional: [Etirwer](https://opengameart.org/content/etirwer) de Kistol (CC0). Ornamento original del sitio inspirado en el fileteado porteño.
- API del mismo origen con clave privada por perfil, límite de tamaño de solicitudes y manos separadas por jugador. El despliegue agrega política de contenido y encabezados de seguridad.
- Voz, video y señas a través de Discord. **No hay cámara ni micrófono integrados en la página.**

## Reglas acordadas

Sin flor y sin pica-pica (3v3 se juega siempre en equipos). En malas, la falta envido vale lo que le falta al equipo de menor puntaje para llegar al objetivo; en buenas, lo que le falta al de mayor puntaje. El equipo decide el canto: cualquiera de sus integrantes puede responder. Al mazo concede el valor actual del truco. Estas variantes están explicadas en la ayuda.

## Desplegar en Vercel

1. `vercel link` (o conectar el repo desde el dashboard).
2. Crear un proyecto de Supabase y agregar a Vercel `SUPABASE_DB_URL` para Production con la cadena del **Transaction pooler** (puerto 6543). Guardarla solo como variable secreta del servidor, nunca con prefijo `VITE_`. Descargar el certificado raíz del proyecto desde Database Settings y agregar su contenido a `SUPABASE_CA_CERT` para verificar TLS. Las tablas se crean en el esquema privado `truco_private` al primer acceso. No habilitar ese esquema en la Data API de Supabase.
3. `vercel deploy --prod` (o dejar que el deploy automático de git lo haga).

Durante el primer acceso después de migrar, la API intenta copiar las mesas y el historial del antiguo `DATABASE_URL` de Neon a Supabase. Si Neon no permite leer por cuota, Supabase sigue operativo y la copia se reintenta, como máximo una vez por hora al arrancar una función nueva. No quitar la integración de Neon hasta verificar que las partidas antiguas se copiaron. Sin `SUPABASE_DB_URL` ni otra conexión Postgres, las funciones serverless de Vercel fallan al guardar partidas (no hay disco persistente para SQLite en ese entorno).

## Límites actuales

Las funciones comparten las salas en Postgres y las actualizaciones se serializan con bloqueos de transacción. Antes de un lanzamiento más grande conviene sumar protección ante abuso a nivel de IP y observabilidad. No hay emparejamiento automático: las mesas públicas se eligen de la lista.

## Estructura

- `shared/game.ts`: reglas puras, motor y proyección privada por jugador.
- `shared/random.ts`: generador aleatorio criptográfico sin sesgo para el reparto.
- `server/service.ts` + `server/store.ts`: salas, historial, persistencia (Postgres/SQLite) y bots.
- `server/api.ts` + `api/game.ts`: endpoint HTTP, también expuesto como función de Vercel.
- `src/main.tsx`: lobby, mesa y controles React.
- `src/Lobby.tsx`: mesas públicas, configuración y entrada por código.
- `src/Profile.tsx`: perfil, historial de partidas y recuperación de clave.
- `src/style.css` / `src/light.css` / `src/brand.css`: interfaz, identidad visual y adaptación móvil.
- `tests/`: pruebas del motor y del protocolo multijugador (`tests/online.test.ts` levanta el servidor real y juega mesas de 1v1/2v2/3v3 por HTTP).

## Cartas y licencia

Baraja española de caras catalanas de B. P. Grimaud (1860), conservada por la Bibliothèque nationale de France y disponible en [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Modern_Spanish_Catalan_deck_-_Grimaud_-_1860). Las 40 ilustraciones históricas están en dominio público y se convirtieron a WebP a 360 × 554. La atribución también aparece en la aplicación. Es un mazo clásico completo del mismo tipo de figuras ornamentadas de las referencias; no es una reproducción exacta de la edición fotografiada por el usuario.

La arquitectura se apoya en la [documentación oficial de Vite](https://vite.dev/guide/).
