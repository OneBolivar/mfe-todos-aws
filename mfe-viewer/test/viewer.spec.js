import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const api = 'https://6jwkx3ebma.execute-api.us-east-2.amazonaws.com/dev';
const collection = '/dev/todos';
const first = {
  id: 'tarea-01', title: 'Revisar auditoría', completed: false,
  createdAt: '2026-11-01T11:00:00Z', updatedAt: '2026-11-02T12:00:00Z',
};
const second = { ...first, id: 'tarea-02', title: 'Validar <b>el módulo</b>', completed: true };
const firstUrl = `${collection}/${first.id}`;
const historyUrl = `${firstUrl}/history`;
const created = { eventType: 'todo.created', occurredAt: first.createdAt, snapshot: first };
const updated = { eventType: 'todo.updated', occurredAt: first.updatedAt };

async function mockApi(page, respond) {
  const requests = [];
  await page.route(`${api}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    requests.push(pathname);
    expect(route.request().method()).toBe('GET');
    const { status = 200, json } = await respond(pathname);
    await route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*' } });
  });
  return requests;
}

function dispatch(page, type, id) {
  return page.evaluate(({ type, id }) => {
    window.dispatchEvent(new CustomEvent(type, { detail: { id } }));
  }, { type, id });
}

function trackAborts() {
  const fetchOriginal = window.fetch;
  window.viewerAborts = [];
  window.fetch = (url, options) => {
    options?.signal?.addEventListener('abort', () => {
      window.viewerAborts.push(new URL(url).pathname);
    }, { once: true });
    return fetchOriginal(url, options);
  };
}

test('carga el módulo ES compilado con VERSION, Shadow DOM y registro seguro', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = await mockApi(page, () => ({ json: [first, second] }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Revisar auditoría/ })).toBeVisible();

  const entry = await page.request.get('/todo-viewer.js');
  expect(entry.ok()).toBe(true);
  expect(entry.headers()['content-type']).toMatch(/javascript/);
  const asset = (await entry.text()).match(/(\.\/assets\/todo-viewer-[\w-]+\.js)/)?.[1];
  expect(asset).toBeTruthy();

  const registration = await page.evaluate(async (asset) => {
    const firstClass = customElements.get('todo-viewer');
    const { VERSION } = await import('/todo-viewer.js');
    await import(`${new URL(asset, location.href)}?registro-repetido`);
    return {
      VERSION,
      shadow: Boolean(document.querySelector('todo-viewer').shadowRoot),
      sameClass: firstClass === customElements.get('todo-viewer'),
    };
  }, asset);
  expect(registration).toEqual({ VERSION: version, shadow: true, sameClass: true });
  expect(requests).toEqual([collection]);
  expect(errors).toEqual([]);
});

test('filtra por título y estado, muestra conteos y emite la selección por teclado', async ({ page }) => {
  const completed = { eventType: 'todo.completed', occurredAt: '2026-11-03T10:00:00Z' };
  const payloads = { [collection]: [first, second], [firstUrl]: first, [historyUrl]: [created, updated, completed] };
  const requests = await mockApi(page, (url) => ({ json: payloads[url] }));
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Buscar por título' });
  const list = page.getByRole('list', { name: 'Resultados de tareas' });
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(list.getByRole('button', { name: /Validar <b>el módulo<\/b>/ })).toBeVisible();
  await expect(list.locator('b')).toHaveCount(0);

  await page.getByRole('button', { name: 'Completadas', exact: true }).click();
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(list.getByRole('button', { name: /Validar/ })).toBeVisible();
  await expect(page.locator('.metric dd')).toHaveText(['2', '1', '1']);

  await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
  await search.fill('inexistente');
  await expect(page.getByText('Ninguna tarea coincide con la búsqueda y los filtros.')).toBeVisible();
  await search.fill('AUDITORIA');
  const task = list.getByRole('button', { name: /Revisar auditoría/ });
  await page.evaluate(() => {
    window.addEventListener('todo:selected', ({ detail }) => { window.selectedTodo = detail; }, { once: true });
  });
  await task.focus();
  await page.keyboard.press('Enter');
  await expect(task).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.selectedTodo)).toEqual({ id: first.id });

  const detail = page.getByRole('region', { name: 'Detalle de tarea' });
  await expect(detail.getByText(first.id, { exact: true })).toBeVisible();
  await expect(detail.locator('.metadata time')).toHaveCount(2);
  const timeline = detail.getByRole('list', { name: 'Eventos de auditoría' });
  await expect(timeline.getByRole('listitem').first()).toContainText('Tarea completada');
  await expect(timeline.locator('time').first()).toHaveAttribute('datetime', completed.occurredAt);
  expect(requests.slice(1).sort()).toEqual([firstUrl, historyUrl]);
});

test('muestra carga, error y lista vacía y permite recuperar la consulta', async ({ page }) => {
  let response = { status: 503, json: {} };
  let release;
  const delay = new Promise((resolve) => { release = resolve; });
  await mockApi(page, async () => { await delay; return response; });
  await page.goto('/');
  await expect(page.getByText('Cargando tareas…')).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');

  response = { json: [] };
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Aún no hay tareas.')).toBeVisible();
  await expect(page.locator('.metric dd')).toHaveText(['0', '0', '0']);

  response = { json: [first] };
  await page.getByRole('button', { name: 'Actualizar tareas' }).click();
  await expect(page.getByRole('button', { name: /Revisar auditoría/ })).toBeVisible();
});

test('recarga la lista con created, sincroniza la tarea con updated y limpia la selección con deleted', async ({ page }) => {
  const third = { ...first, id: 'tarea-03', title: 'Preparar la entrega' };
  let tasks = [first, second];
  let detail = first;
  let historyReads = 0;
  const requests = await mockApi(page, (url) => {
    if (url === collection) return { json: tasks };
    if (url === firstUrl) return { json: detail };
    historyReads += 1;
    return { json: historyReads < 3 ? [created] : [created, updated] };
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Revisar auditoría/ }).click();
  await expect(page.getByText('Tarea creada', { exact: true })).toBeVisible();

  tasks = [...tasks, third];
  await dispatch(page, 'todo:created', third.id);
  await expect(page.getByRole('button', { name: /Preparar la entrega/ })).toBeVisible();

  tasks = [first, { ...second, title: 'Título de otra tarea actualizado' }, third];
  await dispatch(page, 'todo:updated', second.id);
  await expect(page.getByRole('button', { name: /Título de otra tarea actualizado/ })).toBeVisible();
  expect(requests.filter((url) => url === firstUrl)).toHaveLength(1);

  detail = { ...first, title: 'Auditoría al día', completed: true };
  tasks = [detail, ...tasks.slice(1)];
  await dispatch(page, 'todo:updated', first.id);
  await expect(page.getByRole('heading', { name: detail.title })).toBeVisible();
  await expect(page.getByText('Tarea actualizada', { exact: true })).toBeVisible();
  expect(historyReads).toBe(3);

  tasks = tasks.slice(1);
  await dispatch(page, 'todo:deleted', first.id);
  await expect(page.getByText('Selecciona una tarea para ver sus datos y su historial.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Auditoría al día/ })).toHaveCount(0);
  expect(requests.filter((url) => url === firstUrl)).toHaveLength(2);
});

test('limita a tres las lecturas automáticas de historial vacío y ofrece actualización manual', async ({ page }) => {
  await page.clock.install();
  let events = [];
  const requests = await mockApi(page, (url) => ({ json: url === collection ? [first] : url === firstUrl ? first : events }));
  await page.goto('/');
  await page.getByRole('button', { name: /Revisar auditoría/ }).click();
  await expect(page.getByText('Comprobando si llegaron nuevos eventos…')).toBeVisible();
  await page.clock.fastForward(1_000);
  await expect.poll(() => requests.filter((url) => url === historyUrl).length).toBe(2);
  await expect(page.getByText('Aún no hay eventos de auditoría.')).toBeVisible({ timeout: 6_000 });
  await page.clock.fastForward(20_000);
  expect(requests.filter((url) => url === historyUrl)).toHaveLength(3);

  events = [created];
  await page.getByRole('button', { name: 'Actualizar historial' }).click();
  await expect(page.getByText('Tarea creada', { exact: true })).toBeVisible();
  expect(requests.filter((url) => url === firstUrl)).toHaveLength(1);
});

test('recupera por separado el detalle y el historial cuando la API falla', async ({ page }) => {
  let failing = true;
  await mockApi(page, (url) => {
    if (url === collection) return { json: [first] };
    if (failing) return { status: url === firstUrl ? 404 : 503, json: {} };
    return { json: url === firstUrl ? first : [created] };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Revisar auditoría/ }).click();

  const history = page.getByRole('region', { name: 'Historial de auditoría' });
  await expect(page.getByText('HTTP 404', { exact: false })).toBeVisible();
  await expect(history.getByRole('alert')).toContainText('HTTP 503');
  failing = false;
  await history.getByRole('button', { name: 'Reintentar' }).click();
  await expect(history.getByText('Tarea creada', { exact: true })).toBeVisible();
  await expect(page.getByText('HTTP 404', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: first.title })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('acepta una base terminada en /todos y descarta las respuestas de la configuración anterior', async ({ page }) => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  let loads = 0;
  await page.addInitScript(trackAborts);
  const requests = await mockApi(page, async () => {
    loads += 1;
    if (loads === 1) { await delayed; return { json: [first] }; }
    return { json: [second] };
  });
  await page.goto('/');
  await expect.poll(() => loads).toBe(1);
  const viewer = page.locator('todo-viewer');
  await viewer.evaluate((element, url) => element.setAttribute('api-url', url), `${api}/todos/`);
  await expect(page.getByRole('button', { name: /Validar/ })).toBeVisible();
  release();
  expect(await page.evaluate(() => window.viewerAborts)).toEqual([collection]);
  expect(requests).toEqual([collection, collection]);
  await expect(page.getByRole('button', { name: /Revisar auditoría/ })).toHaveCount(0);
});

test('cancela solicitudes y reconsultas al desmontarse y se recupera al reconectar', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(trackAborts);
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const requests = await mockApi(page, async (url) => {
    if (url === collection) return { json: [first] };
    if (url === firstUrl) { await delayed; return { json: first }; }
    return { json: [] };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Revisar auditoría/ }).click();
  await expect(page.getByText('Comprobando si llegaron nuevos eventos…')).toBeVisible();
  await page.locator('todo-viewer').evaluate((element) => { window.detachedViewer = element; element.remove(); });
  release();
  for (const event of ['todo:created', 'todo:updated', 'todo:deleted']) await dispatch(page, event, first.id);
  await page.clock.fastForward(20_000);
  expect(await page.evaluate(() => window.viewerAborts)).toEqual([firstUrl]);
  expect(requests.slice().sort()).toEqual([collection, firstUrl, historyUrl]);

  await page.evaluate(() => document.querySelector('.demo-panel').append(window.detachedViewer));
  await expect(page.getByRole('button', { name: /Revisar auditoría/ })).toBeVisible();
  await expect(page.getByText('Selecciona una tarea para ver sus datos y su historial.')).toBeVisible();
  expect(requests.filter((url) => url === collection)).toHaveLength(2);
});

test('mantiene el contenido dentro de un viewport de 320 px y usa dos columnas cuando hay espacio', async ({ page }) => {
  const long = { ...first, id: 'id-muy-largo-'.repeat(9), title: 'Títulolargosinpausas'.repeat(8) };
  await page.setViewportSize({ width: 320, height: 812 });
  await mockApi(page, (url) => ({ json: url === collection ? [long] : url.endsWith('/history') ? [created] : long }));
  await page.goto('/');
  await page.getByRole('button', { name: /Títulolargo/ }).click();
  await expect(page.getByRole('heading', { name: long.title })).toBeVisible();
  const layout = () => page.locator('todo-viewer').evaluate((viewer) => {
    const workspace = viewer.shadowRoot.querySelector('.workspace');
    return {
      fit: document.documentElement.scrollWidth === innerWidth && workspace.scrollWidth <= workspace.clientWidth,
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
    };
  });
  expect(await layout()).toEqual({ fit: true, columns: 1 });
  await page.setViewportSize({ width: 1280, height: 850 });
  expect(await layout()).toEqual({ fit: true, columns: 2 });
});
