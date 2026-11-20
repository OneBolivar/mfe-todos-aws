# MFE Viewer · Gestor distribuido TODO

El Viewer consulta tareas e historial de auditoría con Lit y Vite. El Shell lo monta como `<todo-viewer>` y le pasa la URL de la API. Los estilos viven en el Shadow DOM y la compilación del módulo incluye Lit.

## Desarrollo y pruebas

Desde `mfe-viewer/`, usa Node.js 20.19 o posterior en la serie 20, o Node.js 22.12 o posterior.

```sh
npm ci
npm run dev
```

- La página de prueba aislada está en `http://localhost:5175/` y el módulo de desarrollo en `http://localhost:5175/todo-viewer.js`.
- La página de prueba usa la API compartida y realiza consultas GET. Para probar con otra API, cambia `api-url` en la página o al montar el componente.
- Para integrarlo localmente, inicia el Shell de la rama `shell` en `http://localhost:5173`. Su registro de desarrollo ya apunta al Viewer en el puerto `5175`.

Detén el servidor de desarrollo antes de correr las pruebas. Playwright compila y sirve `dist/` en el mismo puerto, e intercepta las consultas de la API con datos simulados.

```sh
npx playwright install chromium
npm test
npm run build
npm run preview
```

`npm run test:unit` prueba la normalización de URLs, el contrato HTTP y la cancelación. `npm run test:e2e` prueba el módulo compilado, la interfaz por teclado, el diseño responsive, los estados de carga y recuperación, los eventos, las reconsultas y el desmontaje. Puedes definir `VIEWER_BROWSER_CHANNEL=chrome` o `msedge` para usar un navegador ya instalado. [Canales de navegador de Playwright](https://playwright.dev/docs/browsers)

## Contrato con el Shell

El Shell obtiene `apiUrl` de `config.json`, importa el módulo de forma dinámica y crea `<todo-viewer api-url="…">` en `slot-viewer`. El módulo registra el elemento una vez y exporta `VERSION`, cuyo valor proviene de `package.json`.

Entrada de `registry.json` para producción, dentro del arreglo `mfes`

```json
{
  "name": "viewer",
  "tag": "todo-viewer",
  "slot": "slot-viewer",
  "url": "https://MI-DISTRIBUCION.cloudfront.net/todo-viewer.js"
}
```

La base oficial es `https://6jwkx3ebma.execute-api.us-east-2.amazonaws.com/dev`. El Viewer acepta la base con o sin `/todos` y quita las barras finales.

| Consulta | Respuesta esperada |
| --- | --- |
| `GET /todos` | Arreglo de tareas con `id`, `title`, `completed`, `createdAt`, `updatedAt` |
| `GET /todos/{id}` | Objeto con los datos de la tarea |
| `GET /todos/{id}/history` | Arreglo con `eventType` y `occurredAt` por evento. Puede incluir `snapshot`. |

El Viewer ordena la lista por actualización y el historial por fecha, del más reciente al más antiguo. Las fechas visibles usan la zona horaria del navegador. El buscador por título admite coincidencias sin tilde y los contadores corresponden a toda la lista.

### Eventos de `window`

| Evento | Dirección | Efecto |
| --- | --- | --- |
| `todo:selected` | Emite | Entrega `{ id }` al seleccionar una tarea. |
| `todo:created` | Escucha | Actualiza la lista. |
| `todo:updated` | Escucha | Actualiza la lista. Si el ID coincide con la selección, consulta también su detalle e historial. Si el evento llega sin ID, actualiza el detalle seleccionado. |
| `todo:deleted` | Escucha | Actualiza la lista y limpia la selección si se eliminó la tarea elegida. |

Ante un historial vacío o sin cambios tras `todo:updated`, la consulta inicial admite hasta dos reconsultas, con esperas de 1 y 2,2 segundos entre lecturas. **Actualizar historial** inicia una consulta bajo demanda. Los errores de lista, detalle e historial tienen reintentos propios. Al desmontarse, el Viewer quita los listeners y cancela las solicitudes y esperas activas.

## Preparar S3 y CloudFront

Ejecuta este procedimiento cuando se autorice la publicación en la cuenta AWS del Viewer.

1. En la cuenta de Jesús, crea un bucket S3 de propósito general con nombre globalmente único, por ejemplo `mfe-todos-viewer-<id-cuenta>-<sufijo>`. Mantén activadas las cuatro opciones de **Block Public Access** y selecciona **Bucket owner enforced** para la propiedad de objetos. Usa el endpoint REST del bucket como origen de CloudFront. [Configuración de un origen S3 privado](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
2. Crea una distribución CloudFront independiente y asocia un **Origin Access Control** de tipo S3 con firma **Always sign**. En el comportamiento predeterminado configura **Redirect HTTP to HTTPS** y permite `GET, HEAD`. Aplica al bucket la siguiente política, reemplazando los tres marcadores. [Política S3 con acceso de lectura para un OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PermitirLecturaDesdeCloudFrontViewer",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::NOMBRE_BUCKET/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::ID_CUENTA:distribution/ID_DISTRIBUCION"
      }
    }
  }]
}
```

3. Guarda esta configuración CORS en **Permissions → Cross-origin resource sharing** del bucket. [Configuración CORS de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)

```json
[
  {
    "AllowedOrigins": ["https://d1ykub9gcq8bmq.cloudfront.net"],
    "AllowedMethods": ["GET", "HEAD"]
  }
]
```

4. Asocia una política de caché de CloudFront con `Origin` en la clave de caché para que llegue a S3 y la respuesta CORS se almacene por origen. Configura TTL mínimo `0`, predeterminado `60` y máximo `31536000`, en segundos. Aplica el comportamiento a la entrada y a `assets/`. El mínimo `0` permite que se respete la revalidación de la entrada. [Caché por encabezados y CORS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/header-caching.html) · [TTL y Cache-Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)

### Publicar la compilación

`dist/todo-viewer.js` conserva la URL pública y reexporta `VERSION` desde el paquete con hash en `dist/assets/`. La página `dist/index.html` se utiliza en la prueba local. Publica únicamente la entrada y los archivos JS con hash.

Con AWS CLI v2, un perfil configurado para tu cuenta y PowerShell abierto en `mfe-viewer/`, verifica que `get-caller-identity` muestra tu ID de cuenta antes de copiar archivos. Las credenciales se administran en el perfil local de AWS.

```powershell
$viewerProfile = 'perfil-del-viewer'
$viewerBucket = 'nombre-global-del-bucket'
$viewerDistribution = 'ID_DISTRIBUCION'
aws sts get-caller-identity --profile $viewerProfile
```

Publica los archivos con hash primero. Sube la entrada estable cuando estén disponibles sus dependencias. [Comando `aws s3 cp`](https://docs.aws.amazon.com/cli/latest/reference/s3/cp.html) · [Invalidación de rutas de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/invalidation-specifying-objects.html)

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del Viewer.' }

aws s3 cp ./dist/assets/ "s3://$viewerBucket/assets/" --recursive --exclude '*' --include '*.js' --content-type 'text/javascript; charset=utf-8' --cache-control 'public,max-age=31536000,immutable' --profile $viewerProfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga de archivos con hash.' }

aws s3 cp ./dist/todo-viewer.js "s3://$viewerBucket/todo-viewer.js" --content-type 'text/javascript; charset=utf-8' --cache-control 'public,max-age=0,must-revalidate' --profile $viewerProfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga de la entrada estable.' }

$viewerInvalidation = aws cloudfront create-invalidation --distribution-id $viewerDistribution --paths '/todo-viewer.js' --query 'Invalidation.Id' --output text --profile $viewerProfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la invalidación de CloudFront.' }
aws cloudfront wait invalidation-completed --distribution-id $viewerDistribution --id $viewerInvalidation --profile $viewerProfile
```

Comprueba `GET` y `HEAD` por HTTPS para la entrada y para el archivo `assets/…` que retorna el `GET`. Ambos deben responder con MIME JavaScript y `Access-Control-Allow-Origin: https://d1ykub9gcq8bmq.cloudfront.net` para ese origen. La entrada debe revalidarse y el paquete con hash debe indicar `immutable`. Comprueba también que el acceso directo al objeto por el endpoint S3 en una sesión sin credenciales devuelve 403.

```powershell
$viewerModule = 'https://MI-DISTRIBUCION.cloudfront.net/todo-viewer.js'
$shellOrigin = 'Origin: https://d1ykub9gcq8bmq.cloudfront.net'
curl.exe --fail --include --header $shellOrigin $viewerModule
curl.exe --fail --head --header $shellOrigin $viewerModule
```

Pásale a Juan la URL final para que actualice la entrada `viewer` en `registry.json` y publique el registro del Shell.

### Demostrar una actualización independiente

1. Con la versión `1.0.0` publicada, abre el Shell en incógnito y comprueba que el pie indica `Viewer: v1.0.0`.
2. En `mfe-viewer/`, ejecuta `npm version 1.0.1 --no-git-tag-version`, `npm test` y `npm run build`. La versión cambia en el paquete y Vite genera un nombre con hash nuevo.
3. Repite la publicación con la misma entrada HTTPS. Conserva los paquetes anteriores en S3 para sesiones que aún usen la primera versión.
4. Tras la invalidación, abre de nuevo el Shell y comprueba `Viewer: v1.0.1` y el hash nuevo en Network.

Para la entrega, captura el ID de cuenta y los archivos en el bucket privado, Block Public Access, la distribución y su OAC, la política S3 restringida, las solicitudes de los tres orígenes frontend en DevTools, el historial cargado y el cambio de versión en el pie del Shell. Repite la prueba final en incógnito con el registro de producción actualizado.
