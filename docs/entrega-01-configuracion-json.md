# Entrega 1 - Comentarios de archivos JSON

Los archivos JSON no aceptan comentarios nativos. Por eso `package.json`,
`tsconfig.json`, `package-lock.json` y `pnpm-lock.yaml` no deben llenarse con
`//` o `/* ... */`, porque eso rompería la instalación o compilación del
proyecto.

## package.json

Linea 1: abre el objeto JSON principal.
Linea 2: `name` define el nombre interno del proyecto.
Linea 3: `version` indica la version actual del proyecto.
Linea 4: `private: true` evita publicar el paquete accidentalmente en npm.
Linea 5: `scripts` agrupa comandos ejecutables con npm o pnpm.
Linea 6: `dev` inicia Next.js en modo desarrollo con Turbopack.
Linea 7: `build` compila la aplicacion para produccion.
Linea 8: `start` ejecuta la aplicacion ya compilada.
Linea 9: `lint` intenta ejecutar revision de estilo/codigo de Next.js.
Linea 10: `crear-usuario` ejecuta el script que crea usuarios desde Node.js.
Linea 12: `dependencies` agrupa librerias necesarias en ejecucion.
Linea 13: `bcryptjs` cifra y compara contrasenas.
Linea 14: `jose` crea y valida tokens JWT.
Linea 15: `next` es el framework principal de la aplicacion.
Linea 16: `pg` permite conectar con PostgreSQL.
Linea 17: `react` permite construir componentes de interfaz.
Linea 18: `react-dom` renderiza React en el navegador.
Linea 19: `sweetalert2` muestra alertas visuales.
Linea 21: `devDependencies` agrupa herramientas de desarrollo.
Lineas 22-26: paquetes `@types` agregan tipos TypeScript a librerias JS.
Linea 27: `typescript` activa tipado, validacion y soporte TS.
Linea 29: cierra el objeto JSON principal.

## tsconfig.json

Linea 1: abre el objeto JSON de configuracion.
Linea 2: `compilerOptions` contiene opciones del compilador TypeScript.
Linea 3: `target` define la version JS objetivo.
Linea 4: `lib` habilita APIs de navegador y JavaScript moderno.
Linea 5: `allowJs` permite incluir archivos JavaScript.
Linea 6: `skipLibCheck` evita revisar internamente tipos de dependencias.
Linea 7: `strict` activa validaciones estrictas.
Linea 8: `noEmit` revisa tipos sin generar archivos.
Linea 9: `esModuleInterop` mejora compatibilidad entre sistemas de modulos.
Linea 10: `module` usa modulos modernos.
Linea 11: `moduleResolution` usa resolucion compatible con bundlers.
Linea 12: `resolveJsonModule` permite importar archivos JSON.
Linea 13: `isolatedModules` exige que cada archivo sea compilable por separado.
Linea 14: `jsx` deja que Next.js procese JSX.
Linea 15: `incremental` acelera revisiones posteriores.
Linea 16: `plugins` activa integracion de Next.js con TypeScript.
Lineas 17-19: `paths` permite imports con alias `@/`.
Linea 21: `include` indica que archivos revisa TypeScript.
Linea 22: `exclude` omite `node_modules`.
Linea 23: cierra la configuracion.

## package-lock.json y pnpm-lock.yaml

Estos archivos son generados automaticamente por gestores de paquetes.
No conviene comentarlos ni editarlos a mano.

`package-lock.json` pertenece a npm.
`pnpm-lock.yaml` pertenece a pnpm.

Como el proyecto tambien tiene `pnpm-workspace.yaml`, lo mas coherente es usar
pnpm como gestor principal y evitar mezclar instalaciones con npm.
