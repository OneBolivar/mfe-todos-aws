# Gestor Distribuido TODO - Microfrontends en AWS

Proyecto universitario de Sistemas Distribuidos que integra tres interfaces independientes para gestionar tareas y consultar su historial de auditoría. El Shell utiliza React, el Editor utiliza Vue 3 y el Viewer utiliza Lit. Cada componente se publica en la cuenta AWS de su integrante mediante S3 privado y CloudFront.

## Código y documentación

Este README general está disponible en la raíz de las ramas `main`, `shell`, `editor` y `viewer`. El código de cada componente se mantiene en su rama correspondiente.

| Componente | Responsable del rol | Tecnología | Código y guía técnica |
| --- | --- | --- | --- |
| Shell | Juan Bolívar | React + TypeScript + Vite | [Código del Shell](https://github.com/OneBolivar/mfe-todos-aws/tree/shell/shell) · [README del Shell](https://github.com/OneBolivar/mfe-todos-aws/blob/shell/shell/README.md) |
| Editor | Javier Ruiz | Vue 3 + Vite | [Código del Editor](https://github.com/OneBolivar/mfe-todos-aws/tree/editor/mfe-editor) · [README del Editor](https://github.com/OneBolivar/mfe-todos-aws/blob/editor/mfe-editor/README.md) |
| Viewer e historial | Jesús Castillo | Lit + Vite | [Código del Viewer](https://github.com/OneBolivar/mfe-todos-aws/tree/viewer/mfe-viewer) · [README del Viewer](https://github.com/OneBolivar/mfe-todos-aws/blob/viewer/mfe-viewer/README.md) |

El desarrollo del Editor recibió asistencia de Codex desde la sesión de Jesús. Los commits conservan la identidad Git con la que se realizaron y su historial original.

## Direcciones del proyecto

| Recurso | URL |
| --- | --- |
| Shell del equipo | https://d1ykub9gcq8bmq.cloudfront.net/ |
| Página independiente del Editor | https://d216ytiypzhucu.cloudfront.net/ |
| Módulo ES del Editor | https://d216ytiypzhucu.cloudfront.net/todo-editor.js |
| Módulo ES del Viewer | https://d1uzpk097vso8n.cloudfront.net/todo-viewer.js |
| API REST compartida | https://6jwkx3ebma.execute-api.us-east-2.amazonaws.com/dev |

La página independiente del Editor permite introducir la URL base de la API y pulsar **Conectar API**. Las operaciones manuales escriben en la API configurada.

## Cómo funciona

1. El Shell obtiene la base de la API desde `config.json` y las URLs de los microfrontends desde `registry.json`.
2. Importa cada módulo con `import()`, comprueba su Custom Element y le entrega la configuración mediante `api-url`.
3. El Editor crea, actualiza y elimina tareas mediante POST, PUT parcial y DELETE. La eliminación requiere confirmación.
4. El Viewer consulta la lista, el detalle y el historial mediante GET, y permite seleccionar una tarea para editarla.
5. Los componentes se comunican mediante eventos de navegador en `window`.

| Evento | Emisor | Información |
| --- | --- | --- |
| `todo:selected` | Viewer | ID de la tarea seleccionada |
| `todo:created` | Editor | TODO creado |
| `todo:updated` | Editor | TODO actualizado |
| `todo:deleted` | Editor | ID de la tarea eliminada |

El backend compartido utiliza API Gateway, Lambda, DynamoDB, SNS y SQS. La auditoría se procesa de forma asíncrona, por lo que el historial puede aparecer después de una escritura.

## Ejecución local

Usa Node.js 20.19 o posterior en la serie 20, o Node.js 22.12 o posterior, y npm.

Para abrir el Editor desde una copia nueva del repositorio, ejecuta lo siguiente.

```bash
git clone https://github.com/OneBolivar/mfe-todos-aws.git
cd mfe-todos-aws
git switch editor
cd mfe-editor
npm ci
npm run dev
```

Abre http://localhost:5174/ y configura la API con el formulario de conexión. El README técnico explica cómo seleccionar una tarea por ID para probar el componente de forma independiente.

| Componente | Rama | Carpeta | Puerto de desarrollo |
| --- | --- | --- | --- |
| Shell | `shell` | `shell/` | `5173` de Vite por defecto |
| Editor | `editor` | `mfe-editor/` | `5174` |
| Viewer | `viewer` | `mfe-viewer/` | `5175` |

Para ejecutar otro componente, utiliza su rama y carpeta, instala las dependencias con `npm ci` y sigue su README. La rama `shell` contiene el registro de producción con las URLs de AWS. Para una integración local, configura ese registro con las direcciones localhost de los dos módulos y ejecútalos desde sus respectivas copias de trabajo.

## Pruebas y compilación

Las pruebas automatizadas de los microfrontends utilizan respuestas de API simuladas.

| Componente | Comandos | Resultado comprobado durante la entrega |
| --- | --- | --- |
| Editor | `npm run check` | 16 pruebas unitarias y 32 comprobaciones de navegador aprobadas, junto con la compilación |
| Viewer | `npm test` y `npm run build` | 6 pruebas unitarias y 9 de navegador aprobadas, junto con la compilación |
| Shell | `npm run build` y `npm run lint` | Compilación y ESLint correctos con el registro actualizado |

Antes de ejecutar las pruebas de navegador, instala Chromium con `npx playwright install chromium`. Los README técnicos detallan los puertos utilizados, los contratos, la validación y los casos de error.

## Publicación y estado de integración

El Editor y el Viewer versión `1.0.0` se publicaron con S3 privado y CloudFront. Se comprobaron HTTPS, CORS para el origen del Shell, los metadatos de caché y el rechazo del acceso directo a S3 sin credenciales. La infraestructura del Editor utiliza CloudFormation y Origin Access Control con firma SigV4.

Los cambios del Editor y del Viewer están publicados en sus ramas de GitHub. La rama `shell` también contiene las dos URLs públicas en [el registro de producción](https://github.com/OneBolivar/mfe-todos-aws/blob/shell/shell/public/registry.json).

Queda pendiente publicar ese registro actualizado en AWS del Shell y comprobar el recorrido integrado en una sesión nueva. La última verificación guardada del Shell público todavía apuntaba a localhost. La comprobación conjunta realizada durante el desarrollo utilizó el Shell y el Viewer reales con configuración, registro y API simulados en la sesión de prueba.

Las instrucciones para desplegar, actualizar cada versión y verificar sus recursos se encuentran en los README técnicos de cada componente.
