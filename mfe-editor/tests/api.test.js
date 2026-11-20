import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTodo, deleteTodo, requiredTitle, todosEndpoint, updateTodo } from '../src/api.js';

const base = 'https://api.editor.test/dev';
const todo = { id: 't-1', title: 'Preparar entrega', completed: false };
const originalFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(todo, { status: options.method === 'POST' ? 201 : 200 });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('normaliza la colección sin duplicar /todos', () => {
  assert.equal(todosEndpoint(`${base}/`), `${base}/todos`);
  assert.equal(todosEndpoint(`${base}/todos///`), `${base}/todos`);
});

test('rechaza configuración inválida y credenciales', () => {
  for (const url of ['', undefined, '/dev', 'file:///dev', `${base}?token=secret`, `${base}#section`, 'https://user:password@example.com']) {
    assert.throws(() => todosEndpoint(url));
  }
});

test('valida títulos y elimina espacios exteriores', () => {
  assert.equal(requiredTitle('  Preparar entrega  '), 'Preparar entrega');
  for (const title of ['', '  ', null, 15]) assert.throws(() => requiredTitle(title));
});

test('crea con POST y envía únicamente el título', async () => {
  assert.deepEqual(await createTodo(base, '  Preparar entrega '), todo);
  assert.equal(calls[0].url, `${base}/todos`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[0].body), { title: todo.title });
});

test('impide creación vacía sin tocar la red', async () => {
  await assert.rejects(createTodo(base, ' '), /título/);
  assert.equal(calls.length, 0);
});

test('actualiza solo el título y codifica el identificador', async () => {
  const id = 't/1';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json({ ...todo, id });
  };
  await updateTodo(`${base}/todos`, id, { title: 'Nuevo título', ignored: true });
  assert.equal(calls[0].url, `${base}/todos/t%2F1`);
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].body), { title: 'Nuevo título' });
});

test('acepta completar y reabrir sin enviar título', async () => {
  await updateTodo(base, todo.id, { completed: true });
  await updateTodo(base, todo.id, { completed: false });
  assert.deepEqual(JSON.parse(calls[0].body), { completed: true });
  assert.deepEqual(JSON.parse(calls[1].body), { completed: false });
});

test('rechaza actualizaciones vacías, título vacío y estado inválido', async () => {
  for (const changes of [{}, { title: '' }, { completed: 'true' }]) {
    await assert.rejects(updateTodo(base, todo.id, changes));
  }
  assert.equal(calls.length, 0);
});

test('rechaza identificadores vacíos y segmentos de navegación', async () => {
  for (const id of ['', ' ', '.', '..', null]) await assert.rejects(deleteTodo(base, id));
  assert.equal(calls.length, 0);
});

test('elimina con 204 sin interpretar JSON ni enviar cuerpo', async () => {
  let jsonRead = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, status: 204, json() { jsonRead = true; throw new Error('Sin cuerpo'); } };
  };
  await deleteTodo(base, todo.id);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].body, undefined);
  assert.equal(jsonRead, false);
});

test('explica errores HTTP 400, 404 y 500', async () => {
  for (const status of [400, 404, 500]) {
    globalThis.fetch = async () => new Response('', { status });
    await assert.rejects(createTodo(base, todo.title), new RegExp(`HTTP ${status}`));
  }
});

test('explica errores de red y JSON malformado', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(createTodo(base, todo.title), /red y CORS/);
  globalThis.fetch = async () => new Response('<html>', { status: 200 });
  await assert.rejects(createTodo(base, todo.title), /JSON válido/);
});

test('rechaza respuestas incompletas y tareas de un ID diferente', async () => {
  globalThis.fetch = async () => Response.json({ id: todo.id });
  await assert.rejects(createTodo(base, todo.title), /formato inesperado/);
  globalThis.fetch = async () => Response.json({ ...todo, id: 'otro' });
  await assert.rejects(updateTodo(base, todo.id, { completed: true }), /formato inesperado/);
});

test('maneja 204 en escritura sin intentar JSON', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  await assert.rejects(createTodo(base, todo.title), /sin devolver la tarea/);
});

test('respeta cancelaciones y elimina el listener del AbortSignal', async () => {
  const controller = new AbortController();
  const listeners = new Set();
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (name, fn, options) => { listeners.add(fn); add(name, fn, options); };
  controller.signal.removeEventListener = (name, fn) => { listeners.delete(fn); remove(name, fn); };
  await createTodo(base, todo.title, controller.signal);
  assert.equal(listeners.size, 0);
  controller.abort();
  await assert.rejects(createTodo(base, todo.title, controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 1);
});

test('cancela una petición pendiente sin reintentar la escritura', async () => {
  globalThis.fetch = (url, options) => new Promise((_resolve, reject) => {
    calls.push({ url, ...options });
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const controller = new AbortController();
  const request = createTodo(base, todo.title, controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(calls.length, 1);
});
