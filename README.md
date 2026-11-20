# Gestor Distribuido TODO — Arquitectura de Microfrontends en AWS (Corte 3)

Sistema universitario distribuido de alto rendimiento que implementa una arquitectura modular de microfrontends (MFE) alojada de forma independiente y desacoplada sobre los servicios en la nube de Amazon Web Services (AWS). 

Cada microfrontend es desarrollado con su propio stack tecnológico (React, Vue 3, Lit), empaquetado como Web Component estándar (Custom Elements con Shadow DOM) y publicado en buckets S3 privados protegidos con Origin Access Control (OAC) y distribuidos globalmente con Amazon CloudFront mediante conexiones seguras HTTPS.

---

## 1. Integrantes y Distribución de Roles

| Rol | Componente | Responsable | Stack Tecnológico | URL de Producción |
| :--- | :--- | :--- | :--- | :--- |
| **Rol 1** | **Shell (Host) y Coordinación AWS** | Juan Esteban Bolívar Pacheco | React 19 + TypeScript + Vite | [https://d1ykub9gcq8bmq.cloudfront.net](https://d1ykub9gcq8bmq.cloudfront.net) |
| **Rol 2** | **Microfrontend Editor** | Javier Ruiz | Vue 3 + Vite | [https://d216ytiypzhucu.cloudfront.net/todo-editor.js](https://d216ytiypzhucu.cloudfront.net/todo-editor.js) |
| **Rol 3** | **Microfrontend Viewer e Historial** | Jesús Castillo | Lit 3 + Vite | [https://d1uzpk097vso8n.cloudfront.net/todo-viewer.js](https://d1uzpk097vso8n.cloudfront.net/todo-viewer.js) |

### Responsabilidades por Rol

* **Rol 1 — Shell (Host) y Coordinación AWS (`shell/`):**
  * Orquestación de la aplicación y layout contenedor en tiempo de ejecución.
  * Carga dinámica y asíncrona de los microfrontends mediante imports nativos de JavaScript (`import(mfe.url)`).
  * Lectura de configuración y catálogo en tiempo de ejecución (`config.json` y `registry.json`) sin recompilar código.
  * Provisión de puntos de montaje dinámicos (slots) y manejo de estados de carga y resiliencia ante caídas de red.
  * Configuración de la infraestructura base, gobernanza de CORS y políticas de seguridad OAC.

* **Rol 2 — Microfrontend Editor (`mfe-editor/`):**
  * Formulario reactivo para la creación de nuevas tareas (`POST /todos`).
  * Edición y actualización parcial de títulos y estados de finalización (`PUT /todos/{id}`).
  * Eliminación de tareas con cuadro de diálogo modal de confirmación (`DELETE /todos/{id}`).
  * Manejo estricto de respuestas `HTTP 204 No Content` sin intentar parseo de JSON.
  * Encapsulamiento de estilos e interfaz en Shadow DOM como el Web Component `<todo-editor>`.
  * Despliegue en AWS S3 privado (`mfe-todos-editor-editorbucket-wq9kdsancjzx`) y CloudFront (`E1N1F4054BU651`).
  * Página de prueba independiente: [https://d216ytiypzhucu.cloudfront.net/](https://d216ytiypzhucu.cloudfront.net/).

* **Rol 3 — Microfrontend Viewer e Historial (`mfe-viewer/`):**
  * Consulta y renderizado reactivo de la lista de tareas (`GET /todos`).
  * Detalle de la tarea seleccionada (`GET /todos/{id}`) y emisión del evento de selección.
  * Historial de auditoría asíncrono (`GET /todos/{id}/history`) con estrategia de reintento y sondeo (*backoff polling*) para aguardar la consistencia eventual de eventos en DynamoDB/SNS/SQS.
  * Búsqueda en tiempo real tolerante a diacríticos y filtros por estado (Todas / Pendientes / Completadas).
  * Encapsulamiento como Web Component autónomo `<todo-viewer>` con Lit en Shadow DOM.
  * Despliegue en AWS S3 privado y CloudFront (`d1uzpk097vso8n.cloudfront.net`).

---

## 2. Backend Serverless (Parte 2)

El backend compartido fue desarrollado bajo el stack `todo-serverless-app` utilizando **AWS SAM** (Serverless Application Model) en la región **`us-east-2`** (Ohio).

* **URL Base de la API REST:**  
  `https://6jwkx3ebma.execute-api.us-east-2.amazonaws.com/dev`

### Componentes de Infraestructura del Backend
* **Amazon API Gateway (HTTP/REST API):** Expone los endpoints seguros, maneja el enrutamiento HTTP y las cabeceras CORS para los orígenes autorizados de CloudFront y localhost.
* **AWS Lambda (Python 3.12):** Funciones sin servidor para la resolución de cada verbo HTTP, validación de esquemas y publicación de eventos.
* **Amazon DynamoDB:** Dos tablas NoSQL principales:
  1. Tabla de tareas (`Todos`): Almacena `id`, `title`, `completed`, `createdAt`, `updatedAt`.
  2. Tabla de auditoría (`AuditLog`): Almacena eventos históricos asociados a cada tarea (`eventType`, `occurredAt`, `snapshot`).
* **Amazon SNS & Amazon SQS:** Tópico de notificaciones y cola de mensajería para el desacoplamiento asíncrono. Cuando una tarea es creada, modificada o eliminada, se publica un mensaje que es procesado por un worker Lambda para escribir en el historial de auditoría de forma no bloqueante.

### Contrato de Endpoints

| Método | Endpoint | Descripción | Respuesta Exitosa |
| :--- | :--- | :--- | :--- |
| `GET` | `/todos` | Lista todas las tareas registradas | `200 OK` (Array de tareas) |
| `POST` | `/todos` | Crea una nueva tarea (`title`) | `201 Created` (Objeto tarea) |
| `GET` | `/todos/{id}` | Obtiene los detalles de una tarea | `200 OK` (Objeto tarea) |
| `PUT` | `/todos/{id}` | Actualiza parcialmente `title` o `completed` | `200 OK` (Objeto actualizado) |
| `DELETE` | `/todos/{id}` | Elimina físicamente la tarea | `204 No Content` |
| `GET` | `/todos/{id}/history` | Historial de auditoría asíncrono | `200 OK` (Array de eventos) |

---

## 3. Diagrama de Arquitectura del Sistema

```text
+----------------------------------------------------------------------------------------------------------------+
|                                              CLIENTE (NAVEGADOR WEB)                                           |
|                                                                                                                |
|   +--------------------------------------------- SHELL (Host React) ---------------------------------------+   |
|   | 1. Descarga runtime: fetch('/config.json') y fetch('/registry.json') con cache: 'no-store'              |   |
|   | 2. Import dinámico ES Modules: import(url_editor) y import(url_viewer)                                 |   |
|   | 3. Monta Custom Elements en el DOM: <todo-editor api-url="..."> y <todo-viewer api-url="...">            |   |
|   |                                                                                                        |   |
|   |     +----------------------------+                     +----------------------------+                  |   |
|   |     |    <todo-editor> (Vue 3)   |                     |    <todo-viewer> (Lit 3)   |                  |   |
|   |     |      (Shadow DOM open)     |                     |      (Shadow DOM open)     |                  |   |
|   |     |                            |                     |                            |                  |   |
|   |     | - Formulario Crear/Editar  |                     | - Lista de tareas          |                  |   |
|   |     | - Modal Eliminar (204)     |                     | - Detalle + Filtros        |                  |   |
|   |     | - Lee prop: apiUrl         |                     | - Historial de Auditoría   |                  |   |
|   |     +-------------+--------------+                     +-------------+--------------+                  |   |
|   |                   |                                                  ^                             |   |
|   |                   |   window.dispatchEvent('todo:created', todo)     |                             |   |
|   |                   |   window.dispatchEvent('todo:updated', todo)     |                             |   |
|   |                   +--------------------------------------------------+                             |   |
|   |                   |   window.dispatchEvent('todo:deleted', { id })   |                             |   |
|   |                   |                                                  |                             |   |
|   |                   |   window.dispatchEvent('todo:selected', { id })  |                             |   |
|   |                   +<-------------------------------------------------+                             |   |
|   |                                                                                                        |   |
|   +-------------------+--------------------------------------------------+---------------------------------+   |
+-----------------------|--------------------------------------------------|-------------------------------------+
                        |                                                  |
           Operaciones POST, PUT, DELETE                               Consultas GET (List, Detail, History)
                        |                                                  |
                        v                                                  v
+----------------------------------------------------------------------------------------------------------------+
|                                         BACKEND SERVERLESS (AWS us-east-2)                                     |
|                                                                                                                |
|                      Amazon API Gateway (REST API): /dev/todos  (CORS habilitado)                              |
|                                                   |                                                            |
|                           +-----------------------+-----------------------+                                    |
|                           |                                               |                                    |
|                           v                                               v                                    |
|             AWS Lambda (CRUD Handlers)                          AWS Lambda (Audit Worker)                      |
|                           |                                               ^                                    |
|              +------------+------------+                                  |                                    |
|              |                         |                         +--------+--------+                           |
|              v                         v                         |                 |                           |
|       Amazon DynamoDB             Amazon SNS  ===============> Amazon SQS          |                           |
|        (Tabla Todos)            (TodoTopic)       (Cola)     (AuditQueue)          |                           |
|                                                                                    v                           |
|                                                                             Amazon DynamoDB                    |
|                                                                             (Tabla AuditLog)                   |
+----------------------------------------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------------------------------------+
|                                    INFRAESTRUCTURA DE DESPLIEGUE EN AWS                                        |
|                                                                                                                |
|   +---------------------------+    +---------------------------+    +--------------------------------------+   |
|   |   Shell (Juan Bolívar)    |    |    Editor (Javier Ruiz)   |    |       Viewer (Jesús Castillo)        |   |
|   |  https://d1ykub...net     |    |   https://d216yt...net    |    |        https://d1uzpk...net          |   |
|   |                           |    |                           |    |                                      |   |
|   |     Amazon CloudFront     |    |     Amazon CloudFront     |    |          Amazon CloudFront           |   |
|   |     (Distribución OAC)    |    |     (Distribución OAC)    |    |          (Distribución OAC)          |   |
|   |             |             |    |             |             |    |                  |                   |   |
|   |             v             |    |             v             |    |                  v                   |   |
|   |       S3 Bucket Privado   |    |       S3 Bucket Privado   |    |            S3 Bucket Privado         |   |
|   |      (Block Public Access)|    |      (Block Public Access)|    |           (Block Public Access)      |   |
|   +---------------------------+    +---------------------------+    +--------------------------------------+   |
+----------------------------------------------------------------------------------------------------------------+
```

---

## 4. Comunicación Desacoplada entre Microfrontends

Los componentes no comparten dependencias de frameworks ni se importan directamente entre sí. Toda la interacción ocurre a través del bus de eventos nativo del navegador (`window`) mediante `CustomEvent`:

```text
Viewer (Emisor) --------> window.dispatchEvent('todo:selected', { detail: { id } })
                              └──────> Editor (Receptor escucha y carga la tarea en formulario de edición)

Editor (Emisor) --------> window.dispatchEvent('todo:created', { detail: todo })
Editor (Emisor) --------> window.dispatchEvent('todo:updated', { detail: todo })
Editor (Emisor) --------> window.dispatchEvent('todo:deleted', { detail: { id } })
                              └──────> Viewer (Receptor actualiza lista y consulta historial asíncrono)
```

Ambos microfrontends limpian sus escuchas (`removeEventListener`) en el gancho de ciclo de vida de desconexión (`disconnectedCallback` / `onUnmounted`) para evitar fugas de memoria.

---

## 5. Ejecución Local y Despliegue Independiente

El repositorio está estructurado como un monorepo que alberga tanto el Shell como los microfrontends autónomos.

### Requisitos Previos
* Node.js `^20.19.0` o `>=22.12.0`
* npm (incluido con Node.js)

### Ejecución de Todos los Servicios en Local

Para levantar el entorno integrado completo en tu máquina:

```bash
# 1. Clonar e ingresar al repositorio
git clone https://github.com/OneBolivar/mfe-todos-aws.git
cd mfe-todos-aws

# 2. Iniciar el Shell (Puerto 5173 por defecto)
cd shell
npm ci
npm run dev

# 3. En otra terminal, iniciar el Editor (Puerto 5174)
cd ../mfe-editor
npm ci
npm run dev

# 4. En otra terminal, iniciar el Viewer (Puerto 5175)
cd ../mfe-viewer
npm ci
npm run dev
```

> **Nota para desarrollo local:** El archivo `shell/public/registry.json` puede apuntar a las direcciones locales (`http://localhost:5174/todo-editor.js` y `http://localhost:5175/todo-viewer.js`) durante pruebas sin conexión a internet.

---

### Despliegue Independiente y Actualizaciones en Producción

Una ventaja fundamental de esta arquitectura es el **desacoplamiento total de despliegue**:

#### A. Actualizar el registro sin recompilar el Shell (Zero-Downtime)
El Shell no contiene URLs fijas ni empaqueta a los microfrontends. Al iniciar, solicita `/registry.json` con `cache: 'no-store'`.
1. Para apuntar a una nueva versión o nueva URL de un microfrontend, simplemente actualiza `registry.json` en el bucket S3 del Shell.
2. Invalida la ruta en CloudFront:
   ```bash
   aws cloudfront create-invalidation --distribution-id <SHELL_DIST_ID> --paths "/registry.json" "/config.json"
   ```
3. Cualquier usuario que cargue la aplicación consumirá de inmediato los nuevos módulos sin que el código del Shell haya cambiado ni requerido un nuevo build.

#### B. Publicar una nueva versión de un Microfrontend (ej. `1.0.0` a `1.0.1`)
1. Incrementa la versión en el `package.json` del componente (`mfe-editor` o `mfe-viewer`).
2. Ejecuta `npm run build`. Vite generará un paquete JavaScript versionado por hash en `dist/assets/todo-*-HASH.js`.
3. Sube los archivos con hash a S3 configurando caché inmutable:
   ```bash
   aws s3 cp ./dist/assets/ s3://<BUCKET_MFE>/assets/ --recursive --cache-control "public,max-age=31536000,immutable"
   ```
4. Sube la entrada fija (`todo-editor.js` o `todo-viewer.js`) configurando revalidación inmediata:
   ```bash
   aws s3 cp ./dist/todo-editor.js s3://<BUCKET_MFE>/todo-editor.js --cache-control "public,max-age=0,must-revalidate"
   ```
5. Invalida la entrada en la distribución de CloudFront del microfrontend:
   ```bash
   aws cloudfront create-invalidation --distribution-id <MFE_DIST_ID> --paths "/todo-editor.js"
   ```
6. El Shell y los usuarios reciben la nueva versión automáticamente sin recompilar ni alterar el Shell ni los demás microfrontends.

---

## 6. Índice de Evidencias

Las capturas que certifican el correcto despliegue, configuración en AWS y funcionamiento del sistema se encuentran consolidadas en la carpeta [`evidencias/`](file:///home/ruta_ts/Escritorio/mfe-todos-aws/evidencias):

| Archivo | Descripción del Contenido |
| :--- | :--- |
| **`evidencias/JJJ-1.jpg`** | Configuración de buckets S3 privados, activación estricta de *Block Public Access* y distribución de Amazon CloudFront con Origin Access Control (OAC). |
| **`evidencias/JJJ-2.jpg`** | Políticas de bucket S3 restringidas por `AWS:SourceArn` de CloudFront, configuración de cabeceras CORS (`AllowedOrigins`, `GET`, `HEAD`) y validación de permisos. |
| **`evidencias/JJJ-3.jpg`** | Prueba integrada en vivo del sistema en CloudFront: Shell cargando los dos Web Components (`<todo-editor>` y `<todo-viewer>`), invocación a la API Serverless y visualización del historial asíncrono. |

---

## 7. Pruebas Automatizadas

Cada módulo cuenta con su suite de pruebas unitarias y de integración en navegador:

| Componente | Comando | Tipos de Pruebas |
| :--- | :--- | :--- |
| **Editor** | `npm run check` | 16 pruebas unitarias (`tests/api.test.js`) + 32 comprobaciones e2e con Playwright (`tests/browser/editor.spec.js`) |
| **Viewer** | `npm test` | 6 pruebas unitarias (`test/api.test.js`) + 9 pruebas de integración e2e con Playwright (`test/viewer.spec.js`) |
| **Shell** | `npm run build && npm run lint` | Verificación de compilación TypeScript/Vite y análisis de reglas ESLint |
