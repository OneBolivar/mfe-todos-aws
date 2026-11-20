import { expect, test } from '@playwright/test';

const api = 'https://api.editor.test/dev';
const selected = { id: 't-1', title: 'Preparar exposición', completed: false };
let requests;

async function select(page, detail = { id: selected.id }) {
  await page.evaluate((value) => window.dispatchEvent(new CustomEvent('todo:selected', { detail: value })), detail);
}

async function events(page) {
  return page.evaluate(() => window.editorEvents);
}

test.beforeEach(async ({ page }) => {
  requests = [];
  await page.addInitScript(() => {
    window.editorEvents = [];
    window.selectedListeners = new Set();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (name, listener, options) => {
      if (name === 'todo:selected') window.selectedListeners.add(listener);
      add(name, listener, options);
    };
    window.removeEventListener = (name, listener, options) => {
      if (name === 'todo:selected') window.selectedListeners.delete(listener);
      remove(name, listener, options);
    };
    for (const name of ['todo:created', 'todo:updated', 'todo:deleted']) {
      add(name, (event) => window.editorEvents.push({ name, detail: event.detail }));
    }
  });
  await page.route('https://api.editor.test/**', async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    if (request.method() === 'DELETE') {
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({
      status: request.method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ...selected, ...request.postDataJSON() }),
    });
  });
  await page.goto('/');
  await expect(page.locator('todo-editor').getByRole('heading', { name: 'Editor de tareas' })).toBeVisible();
  await page.locator('#api-url').fill(api);
  await page.getByRole('button', { name: 'Conectar API' }).click();
});

test('funciona aislado, registra Shadow DOM y exporta VERSION', async ({ page }) => {
  const contract = await page.evaluate(async () => {
    const module = await import('/todo-editor.js');
    return { version: module.VERSION, registered: Boolean(customElements.get('todo-editor')), shadow: Boolean(document.querySelector('todo-editor').shadowRoot) };
  });
  expect(contract).toEqual({ version: '1.0.0', registered: true, shadow: true });
  await expect(page.locator('todo-editor').getByText('Selecciona una tarea', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test('crea una tarea y emite el TODO completo en window', async ({ page }) => {
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Título', { exact: true }).fill('  Estudiar AWS  ');
  await editor.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(editor.getByText('Tarea creada correctamente.')).toBeVisible();
  expect(requests).toEqual([{ method: 'POST', url: `${api}/todos`, body: { title: 'Estudiar AWS' } }]);
  expect(await events(page)).toEqual([{ name: 'todo:created', detail: { ...selected, title: 'Estudiar AWS' } }]);
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('');
});

test('valida título vacío, conserva el texto tras un error y permite corregirlo', async ({ page }) => {
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Título', { exact: true }).fill('   ');
  await editor.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(editor.getByRole('alert')).toContainText('Escribe un título');
  expect(requests).toEqual([]);
  await editor.getByLabel('Título', { exact: true }).fill('Tarea válida');
  await editor.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(editor.getByRole('status')).toContainText('creada correctamente');
});

test('recibe solo ID y actualiza únicamente el título sin GET', async ({ page }) => {
  await select(page);
  const editor = page.locator('todo-editor');
  await expect(editor.locator('.selected-id code')).toHaveText(selected.id);
  await editor.getByLabel('Nuevo título (opcional)').fill('Título nuevo');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor.getByText('Tarea actualizada correctamente.')).toBeVisible();
  expect(requests).toEqual([{ method: 'PUT', url: `${api}/todos/t-1`, body: { title: 'Título nuevo' } }]);
  expect((await events(page))[0]).toEqual({ name: 'todo:updated', detail: { ...selected, title: 'Título nuevo' } });
});

test('completa desde un ID y conserva el título desconocido', async ({ page }) => {
  await select(page);
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Estado', { exact: true }).selectOption('true');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor.getByText('Tarea actualizada correctamente.')).toBeVisible();
  expect(requests[0].body).toEqual({ completed: true });
  expect((await events(page))[0].detail.completed).toBe(true);
});

test('respeta el estado false y compara con datos opcionales conocidos', async ({ page }) => {
  await select(page, { ...selected, completed: true });
  const editor = page.locator('todo-editor');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor.getByRole('alert')).toContainText('Cambia el título o el estado');
  expect(requests).toEqual([]);
  await editor.getByLabel('Estado', { exact: true }).selectOption('false');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor.getByText('Tarea actualizada correctamente.')).toBeVisible();
  expect(requests[0].body).toEqual({ completed: false });
});

test('rechaza título de edición con espacios sin perder la selección', async ({ page }) => {
  await select(page);
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Nuevo título (opcional)').fill('   ');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editor.getByRole('alert')).toContainText('Escribe un título');
  expect(requests).toEqual([]);
  await expect(editor.locator('.selected-id code')).toHaveText(selected.id);
});

test('confirma antes de eliminar, permite cancelar y maneja HTTP 204', async ({ page }) => {
  await select(page);
  const editor = page.locator('todo-editor');
  await editor.getByRole('button', { name: 'Eliminar tarea', exact: true }).click();
  await expect(editor.getByRole('dialog')).toBeVisible();
  expect(requests).toEqual([]);
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(editor.getByRole('dialog')).not.toBeVisible();
  expect(requests).toEqual([]);
  await editor.getByRole('button', { name: 'Eliminar tarea', exact: true }).click();
  await editor.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(editor.getByText('Tarea eliminada correctamente.')).toBeVisible();
  await expect(editor.getByText('Selecciona una tarea', { exact: true })).toBeVisible();
  expect(requests).toEqual([{ method: 'DELETE', url: `${api}/todos/t-1`, body: null }]);
  expect(await events(page)).toEqual([{ name: 'todo:deleted', detail: { id: selected.id } }]);
});

for (const status of [400, 404]) {
  test(`muestra HTTP ${status} y no emite eventos de éxito`, async ({ page }) => {
    await page.route('https://api.editor.test/**', (route) => route.fulfill({ status, body: '{}' }));
    await select(page);
    const editor = page.locator('todo-editor');
    await editor.getByLabel('Estado', { exact: true }).selectOption('true');
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(editor.getByRole('alert')).toContainText(`HTTP ${status}`);
    await expect(editor.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect(await events(page)).toEqual([]);
  });
}

test('muestra fallo de red y permite corregir sin reenvío automático', async ({ page }) => {
  await page.route('https://api.editor.test/**', (route) => route.abort('failed'));
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Título', { exact: true }).fill('Conservar borrador');
  await editor.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(editor.getByRole('alert')).toContainText('red y CORS');
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Conservar borrador');
  expect(await events(page)).toEqual([]);
});

test('bloquea controles durante una escritura y evita envíos duplicados', async ({ page }) => {
  let finish;
  await page.route('https://api.editor.test/**', async (route) => {
    requests.push(route.request().method());
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(selected) });
  });
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Título', { exact: true }).fill('Una sola vez');
  await editor.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(editor.getByLabel('Título', { exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const form = document.querySelector('todo-editor').shadowRoot.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => requests.length).toBe(1);
  finish();
  await expect(editor.getByText('Tarea creada correctamente.')).toBeVisible();
  expect((await events(page)).length).toBe(1);
});

test('una respuesta tardía conserva la nueva selección', async ({ page }) => {
  let finish;
  await page.route('https://api.editor.test/**', async (route) => {
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...selected, completed: true }) });
  });
  await select(page);
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Estado', { exact: true }).selectOption('true');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await select(page, { id: 'otra-tarea' });
  finish();
  await expect(editor.getByText('Tarea actualizada correctamente.')).toBeVisible();
  await expect(editor.locator('.selected-id code')).toHaveText('otra-tarea');
  expect((await events(page))[0].detail.id).toBe(selected.id);
});

test('elimina listeners al desmontar y los restaura una sola vez al reconectar', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.selectedListeners.size)).toBe(1);
  await page.evaluate(() => {
    window.detachedEditor = document.querySelector('todo-editor');
    window.detachedEditor.remove();
  });
  await expect.poll(() => page.evaluate(() => window.selectedListeners.size)).toBe(0);
  await select(page);
  await page.evaluate(() => document.querySelector('[aria-label="Componente Editor"]').append(window.detachedEditor));
  await expect.poll(() => page.evaluate(() => window.selectedListeners.size)).toBe(1);
  await expect(page.locator('todo-editor').getByText('Selecciona una tarea', { exact: true })).toBeVisible();
  await select(page);
  await expect(page.locator('todo-editor').locator('.selected-id code')).toHaveText(selected.id);
});

test('cambiar API cancela la solicitud y limpia la selección anterior', async ({ page }) => {
  let finish;
  await page.route('https://api.editor.test/**', async (route) => {
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(selected) }).catch(() => {});
  });
  await select(page);
  const editor = page.locator('todo-editor');
  await editor.getByLabel('Estado', { exact: true }).selectOption('true');
  await editor.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await editor.evaluate((element) => element.setAttribute('api-url', 'https://otra-api.editor.test/dev'));
  finish();
  await expect(editor.getByText('Selecciona una tarea', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Crear tarea' })).toBeEnabled();
  expect(await events(page)).toEqual([]);
});

test('escapa contenido externo y se adapta a una pantalla de 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await select(page, { id: '<img src=x onerror=alert(1)>', title: '<script>alert(1)</script>', completed: false });
  const editor = page.locator('todo-editor');
  await expect(editor.getByLabel('Título', { exact: true }).last()).toHaveValue('<script>alert(1)</script>');
  expect(await editor.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await editor.getByRole('button', { name: 'Eliminar tarea', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor.getByRole('dialog')).not.toBeVisible();
});
