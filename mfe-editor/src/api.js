const REQUEST_TIMEOUT_MS = 12_000;

export class EditorError extends Error {}

export function todosEndpoint(configuredUrl) {
  let url;
  try {
    url = new URL(configuredUrl?.trim());
  } catch {
    throw new EditorError('Configura api-url con una URL HTTP o HTTPS absoluta.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new EditorError('api-url debe ser HTTP o HTTPS y estar libre de credenciales, consultas y fragmentos.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/todos') ? path : `${path}/todos`;
  return url.href;
}

export function validId(id) {
  return typeof id === 'string' && id.trim().length > 0 && !['.', '..'].includes(id);
}

function itemEndpoint(url, id) {
  if (!validId(id)) throw new EditorError('Selecciona una tarea con un ID válido.');
  return `${todosEndpoint(url)}/${encodeURIComponent(id)}`;
}

export function requiredTitle(title) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new EditorError('Escribe un título que contenga texto.');
  }
  return title.trim();
}

async function write(url, method, body, signal) {
  const controller = new AbortController();
  signal?.throwIfAborted();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new EditorError(
    'La API tardó demasiado. Comprueba el resultado en el Viewer antes de volver a enviar.',
  )), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    if (!response.ok) {
      if (response.status === 400) throw new EditorError('La API rechazó los datos (HTTP 400). Revisa el título y el estado.');
      if (response.status === 404) throw new EditorError('La tarea ya no existe (HTTP 404). Selecciona otra en el Viewer.');
      throw new EditorError(`No se pudo guardar la operación (HTTP ${response.status}).`);
    }
    if (method === 'DELETE') return;
    if (response.status === 204) throw new EditorError('La API confirmó la escritura sin devolver la tarea. Actualiza el Viewer para comprobarla.');
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof EditorError) throw error;
    if (error instanceof SyntaxError) throw new EditorError('La respuesta de la API no contiene JSON válido. Comprueba el resultado en el Viewer.');
    throw new EditorError('No se pudo conectar con la API. Revisa la red y CORS, y comprueba el Viewer antes de reenviar.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function validateTodo(todo, expectedId) {
  if (!validId(todo?.id) || typeof todo.title !== 'string' || typeof todo.completed !== 'boolean'
    || (expectedId !== undefined && todo.id !== expectedId)) {
    throw new EditorError('La API devolvió una tarea con formato inesperado. Comprueba el resultado en el Viewer.');
  }
  return todo;
}

export async function createTodo(url, title, signal) {
  const body = { title: requiredTitle(title) };
  return validateTodo(await write(todosEndpoint(url), 'POST', body, signal));
}

export async function updateTodo(url, id, changes, signal) {
  const body = {};
  if (Object.hasOwn(changes, 'title')) body.title = requiredTitle(changes.title);
  if (Object.hasOwn(changes, 'completed')) {
    if (typeof changes.completed !== 'boolean') throw new EditorError('El estado de la tarea debe ser verdadero o falso.');
    body.completed = changes.completed;
  }
  if (Object.keys(body).length === 0) throw new EditorError('Cambia el título o el estado antes de guardar.');
  return validateTodo(await write(itemEndpoint(url, id), 'PUT', body, signal), id);
}

export async function deleteTodo(url, id, signal) {
  await write(itemEndpoint(url, id), 'DELETE', undefined, signal);
}
