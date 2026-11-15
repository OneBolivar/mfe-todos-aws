import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHistory, getTodo, getTodos, todoEndpoint, todosEndpoint, ViewerError } from '../src/api.js';

const base = 'https://gateway.example/dev';
const collection = `${base}/todos`;
const task = { id: 'tarea / 1', title: 'Revisar historial', completed: false, updatedAt: '2026-11-01T12:00:00Z' };

test('normaliza la base del API sin duplicar el segmento /todos', () => {
  for (const url of [base, `${base}/`, collection, `  ${collection}///  `]) {
    assert.equal(todosEndpoint(url), collection);
  }
  assert.equal(todosEndpoint('http://localhost:9000/'), 'http://localhost:9000/todos');
  assert.equal(todosEndpoint(`${base}/mistodos`), `${base}/mistodos/todos`);
});

test('rechaza configuraciones que no son bases HTTP válidas', () => {
  for (const url of [undefined, '', '/dev', 'javascript:alert(1)', `${base}?path=x`, `${base}#dev`, 'https://u:p@example.com/dev']) {
    assert.throws(() => todosEndpoint(url), ViewerError);
  }
});

test('codifica el identificador como un segmento de URL', () => {
  assert.equal(todoEndpoint(collection, 'tarea /?#1'), `${collection}/tarea%20%2F%3F%231`);
});

test('consulta los tres endpoints con GET y ordena las tareas y eventos recientes primero', async (t) => {
  const newer = { ...task, id: 'tarea-2', updatedAt: '2026-11-02T12:00:00Z' };
  const created = { eventType: 'todo.created', occurredAt: '2026-11-01T11:00:00Z' };
  const updated = { eventType: 'todo.updated', occurredAt: '2026-11-01T12:00:00Z' };
  const detail = todoEndpoint(collection, task.id);
  const responses = new Map([[collection, [task, newer]], [detail, task], [`${detail}/history`, [{ ...created, snapshot: task }, updated]]]);
  const fetched = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(responses.get(url));
  });
  const { signal } = new AbortController();
  assert.deepEqual(await getTodos(collection, signal), [newer, task]);
  assert.deepEqual(await getTodo(collection, task.id, signal), task);
  assert.deepEqual(await getHistory(collection, task.id, signal), [updated, created]);
  assert.deepEqual(fetched.mock.calls.map(({ arguments: [url] }) => url), [...responses.keys()]);
});

test('distingue errores HTTP, de JSON, de conexión y de contrato', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const { signal } = new AbortController();
  await assert.rejects(getTodos(collection, signal), /HTTP 503/);
  fetchMock.mock.mockImplementation(async () => new Response('<html>'));
  await assert.rejects(getTodos(collection, signal), /JSON válido/);
  fetchMock.mock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(getTodos(collection, signal), /establecer conexión/);
  fetchMock.mock.mockImplementation(async () => Response.json({ todos: [] }));
  await assert.rejects(getTodos(collection, signal), /lista de tareas con un formato inesperado/);
  await assert.rejects(getTodo(collection, task.id, signal), /detalle de tarea con un formato inesperado/);
  await assert.rejects(getHistory(collection, task.id, signal), /historial con un formato inesperado/);
});

test('propaga la cancelación de una solicitud al fetch', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = getTodos(collection, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
