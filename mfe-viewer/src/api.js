const MAX_REQUEST_MS = 12_000;

export class ViewerError extends Error {}

export function todosEndpoint(configuredUrl) {
  const input = configuredUrl?.trim();
  if (!input) throw new ViewerError('Configura el atributo api-url para consultar las tareas.');

  let url;
  try {
    url = new URL(input);
  } catch {
    url = null;
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ViewerError('api-url debe ser una URL HTTP o HTTPS absoluta y sin credenciales, consultas ni fragmentos.');
  }

  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/todos') ? path : `${path}/todos`;
  return url.href;
}

export function todoEndpoint(collectionUrl, id) {
  return `${collectionUrl}/${encodeURIComponent(id)}`;
}

function isTodo(todo) {
  return typeof todo?.id === 'string' && todo.id.trim().length > 0 && todo.id !== '.' && todo.id !== '..'
    && typeof todo.title === 'string' && typeof todo.completed === 'boolean';
}

function dateValue(value) {
  return typeof value === 'string' ? (Date.parse(value) || 0) : 0;
}

async function getJson(url, signal) {
  const request = new AbortController();
  const cancel = () => request.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => request.abort(new ViewerError('La API tardó demasiado en responder.')), MAX_REQUEST_MS);

  try {
    const response = await fetch(url, { method: 'GET', signal: request.signal, cache: 'no-store' });
    if (!response.ok) throw new ViewerError(`La API respondió con HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    if (error instanceof ViewerError) throw error;
    if (error instanceof SyntaxError) throw new ViewerError('La API devolvió una respuesta que no es JSON válido.');
    throw new ViewerError('No se pudo establecer conexión con la API.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

export async function getTodos(url, signal) {
  const todos = await getJson(url, signal);
  if (!Array.isArray(todos) || !todos.every(isTodo)) {
    throw new ViewerError('La API devolvió una lista de tareas con un formato inesperado.');
  }
  return todos.sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
}

export async function getTodo(url, id, signal) {
  const todo = await getJson(todoEndpoint(url, id), signal);
  if (!isTodo(todo) || todo.id !== id) {
    throw new ViewerError('La API devolvió un detalle de tarea con un formato inesperado.');
  }
  return todo;
}

export async function getHistory(url, id, signal) {
  const events = await getJson(`${todoEndpoint(url, id)}/history`, signal);
  if (!Array.isArray(events) || !events.every(
    (event) => typeof event?.eventType === 'string' && typeof event.occurredAt === 'string',
  )) {
    throw new ViewerError('La API devolvió un historial con un formato inesperado.');
  }
  return events
    .map(({ eventType, occurredAt }) => ({ eventType, occurredAt }))
    .sort((a, b) => dateValue(b.occurredAt) - dateValue(a.occurredAt));
}
