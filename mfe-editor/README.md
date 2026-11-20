# MFE Editor de tareas

Editor independiente para el proyecto universitario Shell y Microfrontends TODO. Utiliza Vue 3, Vite y un Custom Element con Shadow DOM. El rol Editor corresponde a Javier Ruiz. Este desarrollo se realizó con asistencia de Codex desde la sesión de Jesús, utilizando la identidad Git configurada `Chuchossj`. Los commits conservan esa autoría.

## Estado de la entrega local

Se implementaron creación, edición parcial, cambio de estado y eliminación confirmada. Pasaron 16 pruebas unitarias y 32 comprobaciones de navegador, que ejecutan los mismos 16 escenarios sobre desarrollo y producción. Se generó `dist/todo-editor.js`, se comprobó su exportación `VERSION` y el registro de `<todo-editor>`.

La versión 1.0.0 se publicó el 19 de noviembre de 2026 con autorización del usuario y una sesión verificada de la cuenta de Javier Ruiz. CloudFormation terminó en `CREATE_COMPLETE` y CloudFront en `Deployed`. La integración final debe comprobarse cuando Juan publique la URL del Editor en su registro.

## Despliegue publicado

La entrada ES pública del Editor está disponible para el Shell. La página raíz permite configurar manualmente la API y probar el componente de forma independiente. [Módulo del Editor](https://d216ytiypzhucu.cloudfront.net/todo-editor.js), [página independiente](https://d216ytiypzhucu.cloudfront.net/).

| Recurso | Valor verificado |
| --- | --- |
| Cuenta de Javier Ruiz | `484612795268` |
| Región del stack | `us-east-2`, Ohio |
| Stack | `mfe-todos-editor`, `CREATE_COMPLETE` |
| Bucket privado | `mfe-todos-editor-editorbucket-wq9kdsancjzx` |
| Distribución CloudFront | `E1N1F4054BU651`, `Deployed` |
| OAC | `E1GW9MY2GNFTRN`, firma `always` con `sigv4` |
| Implementación publicada | `assets/todo-editor-AfYn6Mfu.js` |

Se verificaron GET y HEAD con HTTP 200 en la entrada y en el archivo con hash, tipo `application/javascript`, CORS para el origen oficial del Shell y los valores de caché previstos. Los SHA-256 de ambos objetos publicados coinciden con la compilación local probada. Un origen diferente recibe la respuesta sin autorización CORS. S3 devolvió HTTP 403 al acceso directo sin credenciales y su política informó `IsPublic: false`, con los cuatro bloqueos públicos activados. HTTP redirige a HTTPS con 301.

El navegador integrado abrió la página pública y cargó el Custom Element. Las comprobaciones HTTP se ejecutaron desde CloudShell. Las peticiones de los clientes HTTP locales terminaron con errores de conexión, por lo que la evidencia HTTP guardada corresponde a CloudShell.

Durante la verificación AWS, el registro público del Shell apuntaba a `localhost` para ambos microfrontends. La rama `shell` del repositorio ya incluye las URLs públicas del Editor y del Viewer. Su publicación en AWS y la comprobación integrada siguen pendientes. Los commits del Editor quedaron publicados en GitHub mediante la cuenta autorizada `OneBolivar`, conservando la autoría de `Chuchossj`.

## Arquitectura y archivos

```text
Shell React
  └─ import(URL del Editor) → VERSION
       └─ <todo-editor api-url="URL_BASE">
            ├─ Vue 3 dentro de Shadow DOM
            ├─ POST /todos
            ├─ PUT /todos/{id}
            └─ DELETE /todos/{id}

Viewer → window todo:selected → Editor
Editor → window todo:created / todo:updated / todo:deleted → Viewer
```

| Archivo | Responsabilidad |
| --- | --- |
| `todo-editor.js` | Exporta la versión y registra el Custom Element una sola vez |
| `src/TodoEditor.ce.vue` | Formularios, confirmación, estados, eventos y estilos encapsulados |
| `src/api.js` | Validación, rutas, escrituras HTTP, cancelación y errores |
| `vite.config.js` | Puerto 5174, CORS local y entrada estable con implementación versionada por hash |
| `index.html` | Página independiente con configuración manual de API y selección por ID |
| `tests/api.test.js` | Pruebas unitarias con `fetch` simulado |
| `tests/browser/editor.spec.js` | Pruebas del Custom Element real con Playwright y API simulada |
| `playwright.config.js` | Ejecuta los escenarios en desarrollo y sobre `dist/` |
| `aws/editor.yaml` | S3 privado, bloqueo público, CloudFront, OAC, CORS y caché |
| `aws/publicar.sh` | Despliegue y actualización desde CloudShell una vez autorizados |
| `aws/registro-editor.json` | Entrada pública verificada para que Juan actualice su registro |

Todas las dependencias del componente se empaquetan en el JavaScript generado. Vue compila los estilos del archivo `.ce.vue` dentro del módulo para insertarlos en Shadow DOM. La entrada pública `dist/todo-editor.js` reexporta `VERSION` desde `dist/assets/todo-editor-HASH.js`, que registra el elemento al importarse.

## Entorno e instalación

Usa Node.js 20.19 o posterior en la serie 20, o Node.js 22.12 o posterior, con npm. Esta entrega se verificó con Node.js 22.22.0 y npm 10.9.4. Las versiones de Vue, Vite y Playwright están fijadas y `package-lock.json` permite reproducir la instalación.

Desde la raíz del repositorio en la rama `editor`, ejecuta los siguientes comandos.

```bash
cd mfe-editor
npm ci
npx playwright install chromium
npm run dev
```

Abre `http://localhost:5174`. Introduce la URL base de una API autorizada y pulsa **Conectar API**. La página permite introducir un ID y emitir la selección para probar la edición de forma independiente. Las operaciones manuales escriben en la API que configures. Las pruebas automatizadas utilizan exclusivamente mocks.

El puerto es estricto. Cierra el proceso que use 5174 si Vite informa que ya está ocupado.

## Contrato con el Shell

| Propiedad | Valor |
| --- | --- |
| Elemento | `<todo-editor>` |
| Atributo | `api-url` |
| Exportación ES | `VERSION = "1.0.0"` |
| Entrada local | `http://localhost:5174/todo-editor.js` |
| Entrada compilada | `dist/todo-editor.js` |

La configuración oficial del equipo utiliza `https://6jwkx3ebma.execute-api.us-east-2.amazonaws.com/dev`. El Shell proporciona esa URL mediante el atributo. La lógica del Editor obtiene la configuración exclusivamente de `api-url`. Acepta bases terminadas en `/dev`, `/dev/`, `/dev/todos` o `/dev/todos/` y normaliza la colección sin repetir `/todos`.

El Shell real de la rama `shell` importa el módulo, comprueba su registro, crea el elemento, asigna `api-url` y lo añade a `slot-editor`. Este Editor cumple ese flujo.

```javascript
const module = await import('http://localhost:5174/todo-editor.js');
const editor = document.createElement('todo-editor');
editor.setAttribute('api-url', apiUrlLeidaDeConfig);
document.querySelector('#slot-editor [data-mfe-mount]').append(editor);
console.log(module.VERSION);
```

Juan debe conservar los demás registros y actualizar la entrada de `editor` con la URL AWS publicada.

```json
{
  "name": "editor",
  "tag": "todo-editor",
  "slot": "slot-editor",
  "url": "https://d216ytiypzhucu.cloudfront.net/todo-editor.js"
}
```

El servidor de desarrollo permite CORS desde `localhost`, `127.0.0.1` y el origen HTTPS oficial del Shell. Para una comprobación local del equipo, utiliza el Shell local y el Editor en 5174. El navegador puede solicitar acceso a la red local si abres el Shell público e importas desde localhost.

## Operaciones y comunicación

Todos los eventos se reciben o emiten en `window`.

| Evento | Emisor | Contenido de `detail` |
| --- | --- | --- |
| `todo:selected` | Viewer | `{ id }`, con `title` y `completed` opcionales |
| `todo:created` | Editor | TODO devuelto por POST, con `id`, `title` y `completed` |
| `todo:updated` | Editor | TODO devuelto por PUT, con `id`, `title` y `completed` |
| `todo:deleted` | Editor | `{ id }` |

```javascript
window.dispatchEvent(new CustomEvent('todo:selected', {
  detail: { id: 'ID-DE-LA-TAREA' }
}));
```

El Editor valida que el título contenga texto y elimina espacios exteriores al enviarlo. Si la selección contiene únicamente un ID, el título de edición permanece vacío y el selector conserva el estado actual. El usuario puede escribir un título o elegir un estado de forma explícita. El cuerpo de PUT incluye exclusivamente los cambios elegidos.

```json
{ "title": "Título actualizado" }
```

```json
{ "completed": true }
```

Si llegan título y estado opcionales, se comparan con los valores conocidos para evitar enviar cambios idénticos. La opción **Pendiente** permite enviar `completed: false`. La selección se conserva si falla la escritura. Una respuesta tardía conserva la nueva tarea que el usuario haya seleccionado mientras terminaba la operación anterior.

La eliminación utiliza un diálogo modal nativo. **Cancelar** y Escape lo cierran. **Confirmar eliminación** inicia DELETE y una respuesta HTTP 204 finaliza correctamente sin interpretar JSON. Después se limpia la selección y se emite `todo:deleted`.

El componente realiza las tres operaciones de escritura y procesa selecciones sin consultas GET. La lectura y actualización visual de la lista pertenecen al Viewer. Los listeners se registran al montar y se eliminan al desmontar. Cambiar `api-url` cancela la solicitud activa y limpia la selección correspondiente a la API anterior.

## Errores y accesibilidad

Los formularios incluyen etiquetas, validación anunciada, estados de procesamiento, foco visible y controles desactivados durante las peticiones. El diálogo de confirmación coloca el foco inicial en **Cancelar** y utiliza el comportamiento modal del navegador. El diseño se comprobó con 320 píxeles de ancho.

Vue interpola los datos externos como texto. Las escrituras omiten credenciales, validan las rutas y manejan HTTP 400, HTTP 404, otros errores HTTP, respuestas inesperadas, fallos de red y JSON inválido.

Cada petición tiene un límite de 12 segundos. Las escrituras se envían una sola vez y los controles impiden peticiones simultáneas desde el componente. Ante un fallo de red o un tiempo agotado, comprueba la lista en el Viewer antes de reenviar porque el servidor podría haber aplicado el cambio. Desmontar el componente cancela la espera del navegador, aunque una escritura ya recibida por el servidor puede completarse.

## Pruebas y compilación

```bash
npm test
npm run build
npm run test:browser
```

Para ejecutar todo en orden, usa `npm run check`. El navegador de Playwright debe estar instalado antes. Las pruebas de navegador ocupan temporalmente 5174 y 4174, por lo que cierra los servidores manuales antes de ejecutarlas.

Se comprobaron creación, validación vacía, PUT parcial, `completed: true` y `false`, confirmación y cancelación de DELETE, HTTP 204, errores 400/404, red, eventos entrantes y salientes, limpieza y reconexión de listeners, respuesta tardía, cambio de API, prevención de peticiones duplicadas, contenido externo seguro y diseño móvil. Los mismos escenarios verifican la versión compilada y la de desarrollo.

Además, el 19 de noviembre de 2026 se realizó una prueba aislada con el Shell público y el Viewer real. Playwright sirvió el Editor compilado desde archivos locales mediante un origen HTTPS simulado y sustituyó la configuración, el registro y la API exclusivamente en la sesión de prueba. Se verificaron creación reflejada en Viewer, selección por ID, actualización de título y estado, y eliminación confirmada con HTTP 204. El recorrido terminó sin errores JavaScript. Después se publicó la misma compilación en AWS y se comprobaron sus hashes. La integración con el registro oficial sigue pendiente.

```bash
npm run preview
```

La vista previa sirve la compilación en 5174. Deben publicarse juntos la entrada `todo-editor.js` y los archivos de `assets/`.

## Publicación y actualizaciones en AWS

El primer despliegue se completó en la cuenta propia de Javier. Este repositorio conserva la plantilla y el script utilizados para reproducirlo y actualizarlo dentro de esa cuenta. Las futuras publicaciones deben realizarse con una sesión autorizada.

La plantilla crea un bucket con las cuatro opciones de Block Public Access activas, propiedad del bucket sin ACL, cifrado y versionado. CloudFront usa el endpoint REST regional de S3, OAC con firma SigV4 y una política `s3:GetObject` limitada al ARN de esa distribución. La distribución redirige HTTP a HTTPS y sirve GET/HEAD.

La política de respuestas añade CORS para `https://d1ykub9gcq8bmq.cloudfront.net`. El bucket también declara ese origen. Las peticiones REST salen del navegador al backend compartido, que debe permitir el origen del Shell y los métodos POST/PUT/DELETE con `Content-Type`. El CORS del módulo y el CORS de la API se configuran en sus respectivos servicios.

Para una actualización autorizada desde CloudShell de Javier, prepara un paquete con las carpetas `dist/` y `aws/`. Conserva la estructura siguiente al extraerlo.

```text
mfe-editor/
  dist/
    todo-editor.js
    index.html
    assets/
  aws/
    editor.yaml
    publicar.sh
```

Comprueba la cuenta activa y ejecuta el script desde la carpeta `mfe-editor`, sustituyendo el argumento por el ID real de la cuenta de Javier.

```bash
aws sts get-caller-identity
bash aws/publicar.sh ID_CUENTA_JAVIER us-east-2
```

El script verifica que la cuenta activa coincide con el ID indicado, valida la plantilla, crea o actualiza el stack `mfe-todos-editor`, publica primero los archivos con hash, publica la entrada y espera la invalidación de CloudFront. Al terminar muestra `https://DOMINIO-EDITOR.cloudfront.net/todo-editor.js` para que Juan la registre.

La ejecución necesita permisos de CloudFormation, S3, CloudFront y STS para los recursos descritos. CloudFormation debe terminar en `CREATE_COMPLETE` o `UPDATE_COMPLETE`. Si hay un fallo, revisa sus eventos antes de reintentar. La plantilla retiene el bucket y sus versiones cuando se elimina el stack, por lo que su limpieza posterior se hace expresamente.

### Caché y actualización independiente

`todo-editor.js` utiliza `public,max-age=0,must-revalidate`. Los archivos con hash reciben `public,max-age=31536000,immutable`. La política CloudFront usa TTL mínimo y predeterminado 0 para respetar los metadatos de los objetos. El script conserva los archivos con hash anteriores para mantener disponibles las dependencias de sesiones abiertas.

Para una nueva versión, actualiza el `VERSION` de la entrada y la versión de `package.json`, actualiza el lock con npm y repite pruebas y compilación. Publica los nuevos archivos y después la entrada mediante el mismo script. Juan conserva la URL estable del registro. Una nueva sesión del navegador carga la entrada actual y muestra la nueva versión en el pie del Shell.

### Verificación posterior a la publicación

Comprueba GET y HEAD tanto en la entrada como en su archivo con hash. Deben responder 200 por HTTPS, con tipo JavaScript, metadatos de caché correctos y `Access-Control-Allow-Origin` para el Shell. El acceso directo sin credenciales a S3 debe responder 403. Verifica el bloqueo público y la política restringida en la consola de AWS.

```bash
curl -I -H 'Origin: https://d1ykub9gcq8bmq.cloudfront.net' \
  https://DOMINIO-EDITOR.cloudfront.net/todo-editor.js
```

Después de que Juan publique el registro, abre el Shell en una sesión nueva. En un conjunto de datos autorizado para la demostración, crea una tarea, selecciónala desde el Viewer, cambia su título y estado y elimina tras confirmar. Comprueba que el Viewer se actualice por eventos y que muestre su auditoría cuando el backend termine de procesarla.

## Problemas frecuentes

| Síntoma | Comprobación |
| --- | --- |
| Controles desactivados al abrir | Asigna un `api-url` HTTP/HTTPS absoluto y revisa el mensaje de configuración |
| Título vacío al seleccionar | El contrato garantiza únicamente el ID. Escribe un nuevo título si quieres cambiarlo |
| Guardar informa que faltan cambios | Introduce un título diferente o elige explícitamente un estado |
| API responde 404 | Confirma que la tarea siga existiendo y que la base incluya `/dev` correctamente |
| Fallo de red o CORS | Revisa Network, origen de la página, OPTIONS del backend y sus métodos permitidos |
| El Shell informa módulo no disponible | Revisa URL del registro, HTTPS, CORS del módulo, tipo JavaScript y presencia de todos los archivos con hash |
| CloudFront responde 403 | Revisa objetos subidos, política S3, ARN de distribución, OAC y eventos de CloudFormation |
| La versión anterior sigue visible | Abre una sesión nueva y comprueba invalidación, entrada estable y archivo con hash cargado |
| Playwright informa que falta el navegador | Ejecuta `npx playwright install chromium` |
| Puerto ocupado durante las pruebas | Detén los servidores locales de 5174 y 4174 |
| GitHub devuelve 403 | Juan debe habilitar escritura a la cuenta autenticada o importar los commits y publicar `editor` desde una cuenta autorizada |

## Git y entrega al equipo

El trabajo se mantiene en la rama `editor` dentro de `mfe-editor/`. Comprueba el alcance antes de preparar nuevos commits.

```bash
git status --short --branch
git diff --stat
git diff --cached --name-only
git push origin editor
```

Los mensajes de commit deben estar en español y conservar la identidad Git autorizada. Si el push informa acceso denegado, los commits permanecen localmente. Para transportarlos, crea un bundle desde la raíz del repositorio.

```bash
git bundle create editor-entrega.bundle editor ^origin/editor
```

Juan o Javier pueden importar ese bundle en una copia limpia del repositorio que tenga la rama base `origin/editor` disponible. Primero revisan los commits y después publican desde su cuenta autorizada.

```bash
git fetch origin
git fetch /ruta/editor-entrega.bundle refs/heads/editor
git log --oneline origin/editor..FETCH_HEAD
git diff --stat origin/editor...FETCH_HEAD
git push origin FETCH_HEAD:refs/heads/editor
```

Si el remoto avanzó desde la base del bundle, deben revisar e integrar los cambios en su rama local `editor` antes de publicar. El historial de los commits mantiene al autor original.

## Referencias técnicas

Se consultaron las guías oficiales de Custom Elements de Vue, compilación de Vite y acceso privado/CORS de CloudFront para preparar la implementación. [Vue y Web Components](https://vuejs.org/guide/extras/web-components.html), [opciones de compilación de Vite](https://vite.dev/config/build-options), [S3 privado con OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [CORS en CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-responseheaderspolicy-corsconfig.html).
