# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Shell · Gestor Distribuido TODO

  Aplicación de composición del monorepo de microfrontends. El Shell presenta el espacio de trabajo, lee la configuración en tiempo de ejecución y carga cada microfrontend como módulo ES independiente. No importa código de `mfe-editor` o `mfe-viewer` ni llama directamente a endpoints `/todos`.

  ## Requisitos previos

  - Node.js `^20.19.0` o `>=22.12.0`.
  - npm, incluido con Node.js.
  - Acceso de red a la API configurada y a las URLs de los microfrontends.

  ## Instalación y desarrollo

  Desde esta carpeta (`shell/`):

  ```bash
  npm install
  npm run dev
  ```

  Vite muestra la URL local al iniciar, normalmente `http://localhost:5173/`. En desarrollo, el registro apunta a los servidores de MFE en `http://localhost:5174` (Editor) y `http://localhost:5175` (Viewer); se pueden iniciar por separado.

  ## Compilación y previsualización

  ```bash
  npm run build
  npm run preview
  ```

  La compilación de producción queda en `dist/`. `npm run preview` sirve esa compilación localmente para una comprobación previa al despliegue.

  ## Configuración en tiempo de ejecución

  El Shell solicita `/config.json` y `/registry.json` con `fetch` y `cache: 'no-store'`. Ambos archivos se leen al iniciar la aplicación, por lo que cambiar sus valores no requiere recompilar los assets del Shell. Al desplegar, deben estar disponibles en la raíz del mismo origen que el Shell.

  ### `public/config.json`

  Define la URL base de la API:

  ```json
  {
    "apiUrl": "https://api.ejemplo.com/dev"
  }
  ```

  `apiUrl` es obligatorio y debe ser una cadena no vacía. El Shell elimina las barras `/` finales antes de pasar el valor al atributo `api-url` de cada Custom Element.

  ### `public/registry.json`

  El registro contiene el arreglo `mfes`. Cada objeto requiere:

  | Campo | Descripción |
  | --- | --- |
  | `name` | Identificador legible del microfrontend, por ejemplo `editor` o `viewer`. |
  | `tag` | Nombre del Custom Element que registra el módulo, por ejemplo `todo-editor`. |
  | `slot` | Contenedor del Shell al que se monta (`slot-editor` o `slot-viewer`). |
  | `url` | URL absoluta al módulo ES del microfrontend. |

  Ejemplo:

  ```json
  {
    "mfes": [
      {
        "name": "editor",
        "tag": "todo-editor",
        "slot": "slot-editor",
        "url": "https://editor.ejemplo.com/todo-editor.js"
      },
      {
        "name": "viewer",
        "tag": "todo-viewer",
        "slot": "slot-viewer",
        "url": "https://viewer.ejemplo.com/todo-viewer.js"
      }
    ]
  }
  ```

  El módulo debe registrar el Custom Element indicado y puede exportar `VERSION` para que el Shell la muestre. Cada URL se importa y monta de forma independiente; un error se presenta en el slot afectado sin bloquear el otro. En producción, sirve los módulos por HTTPS y configura CORS para permitir el origen del Shell.

  ## Despliegue resumido en AWS

  1. Ejecuta `npm run build` y publica el contenido de `dist/` en un bucket S3 dedicado.
  2. Mantén el bucket privado y deja activado **S3 Block Public Access**. No habilites acceso público mediante ACL ni política de bucket.
  3. Crea una distribución de CloudFront con el bucket como origen y configura **Origin Access Control (OAC)** con firma de solicitudes. Restringe la política del bucket al acceso de esa distribución.
  4. Fuerza HTTPS en CloudFront con la política de protocolo de visor **Redirect HTTP to HTTPS** y asocia un certificado TLS válido si usas un dominio propio.
  5. Publica `config.json` y `registry.json` junto al `index.html`. Configura para ambos una política de caché con TTL mínimo `0` y encabezado `Cache-Control: no-store` (o equivalente) para que los cambios de configuración se reflejen sin recompilar. Después de actualizar los JSON, invalida `/config.json` y `/registry.json` en CloudFront si el comportamiento de caché pudiera conservar copias anteriores.
  6. Actualiza `apiUrl` y las URLs HTTPS de los microfrontends para el entorno de producción. Comprueba los permisos CORS de la API y de los orígenes que sirven los módulos ES.

  Antes de habilitar tráfico, comprueba en la distribución que `index.html`, ambos JSON y los módulos remotos cargan por HTTPS y que el bucket S3 no es accesible públicamente.
