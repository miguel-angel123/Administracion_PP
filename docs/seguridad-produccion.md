# Seguridad — estado y checklist

Matriz de controles. Los "aplicado" ya están en el código y no dependen de
HTTPS ni de un dominio real; los "pendiente" se activan al desplegar.

## Aplicados

| # | Punto | Archivo | Evidencia |
|---|---|---|---|
| 1 | RBAC en GET de tickets (listado y detalle) | `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts` | Guard `sesion.role !== "gerente" && sesion.role !== "empleado"` → 403 |
| 2 | RBAC en GET de vehículos (listado/puestos/papelera) y de papelera | `app/api/vehiculos/route.ts` | Guard `esOperativo`; exceptúa solo `recurso=tipos` |
| 3 | Login-CSRF por `Origin` vs `Host` | `app/api/auth/login/route.ts` | Si `origin` no coincide con `host` → 403 |
| 4 | Cookie `token` con `sameSite: "strict"` (login y logout) | `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts` | Set-Cookie idéntico en ambos; el borrado no queda ignorado por el navegador |
| 5 | Validación de fechas `desde`/`hasta` | `app/api/registros/route.ts` | `ISO_DATE.test(...)` antes de tocar la BD; rango invertido → 400 |
| 6 | Instrumentación de latencia de fetch | `lib/auth.tsx` | `performance.now()` en wrapper de `window.fetch`; `console.warn` si > 2000 ms |
| 7 | Caché de sesión con tope (LRU aproximado) | `lib/session.ts` | `MAX_CACHE = 500`; al desbordar, `Map.keys().next().value` descarta la más vieja |
| 8 | Headers seguros compatibles con dev | `next.config.js` → `headers()` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` |
| 9 | Grid responsivo en `Mi Perfil` | `app/perfil/page.tsx` | `className="grid-2col"`; colapsa a 1 columna en `@media (max-width: 900px)` |
| 10 | Soft-delete + estado como única fuente de verdad | `lib/models/vehiculos.model.ts`, `lib/models/tickets.model.ts`, `lib/seed.ts` | `fecha_eliminado` filtrado en cada listado; `estados_id_estado` mantenido en CREATE/UPDATE/DELETE |
| 11 | Transacciones con `FOR UPDATE` en recursos compartidos | `vehiculos.model.ts`, `tickets.model.ts`, `puestos.model.ts`, `tarifas.model.ts` | Serializa altas concurrentes de puesto/placa/tarifa; evita sobreventa y `MAX(numero_puesto)` duplicado |
| 12 | Traducción de errores PG a HTTP controlado | `lib/erroresHttp.ts`, `lib/models/errores.ts` | 23505 → 409, 40P01 → 409, ETIMEDOUT/ECONNRESET → 503, resto → 500 con mensaje neutro |

## Pendientes (al desplegar con HTTPS + dominio)

Solo se activan cuando cambie el entorno. Anotados para no perderlos:

| # | Punto | Dónde | Por qué no ahora |
|---|---|---|---|
| P1 | `Strict-Transport-Security: max-age=31536000; includeSubDomains` | `next.config.js` → `headers()` | El navegador ignora HSTS sobre `http://localhost` |
| P2 | `Content-Security-Policy` estricto (`default-src 'self'`, sin `unsafe-inline`, sin `unsafe-eval`) | `next.config.js` → `headers()` o runtime | Rompe el HMR de Next dev (usa `eval` y scripts inline) |
| P3 | `Permissions-Policy` (micrófono/cámara/geolocalización off) | `next.config.js` → `headers()` | Sin caso de uso actual; se añade al endurecer |
| P4 | Sesiones `secure: true` forzado | `app/api/auth/login/route.ts`, `logout/route.ts` | Ya condicionado a `NODE_ENV === "production"`; no tocar |
| P5 | Reemplazo de `NODE_ENV` check por dominio real en cookies | `login/route.ts` | El flag `NODE_ENV` es correcto en serverless con HTTPS |
| P6 | CSP report-only durante 1–2 sprints antes de pasar a bloqueo | `next.config.js` | Necesita tráfico real para detectar falsos positivos |
