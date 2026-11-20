<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createTodo, deleteTodo, EditorError, requiredTitle, todosEndpoint, updateTodo, validId } from './api.js';

const props = defineProps({ apiUrl: { type: String, default: '' } });
const createTitle = ref('');
const editTitle = ref('');
const completedChoice = ref('');
const selectedId = ref('');
const originalTitle = ref(null);
const originalCompleted = ref(null);
const pending = ref('');
const notice = ref(null);
const createError = ref('');
const editError = ref('');
const createInput = ref(null);
const deleteDialog = ref(null);
let selectionRevision = 0;
let operation = null;

const configurationError = computed(() => {
  try {
    todosEndpoint(props.apiUrl);
    return '';
  } catch (error) {
    return error.message;
  }
});

function closeConfirmation() {
  deleteDialog.value?.close();
}

function setSelection(todo) {
  selectionRevision += 1;
  closeConfirmation();
  selectedId.value = todo?.id ?? '';
  originalTitle.value = typeof todo?.title === 'string' ? todo.title : null;
  originalCompleted.value = typeof todo?.completed === 'boolean' ? todo.completed : null;
  editTitle.value = originalTitle.value ?? '';
  completedChoice.value = '';
  editError.value = '';
}

function onSelected(event) {
  if (!validId(event.detail?.id)) return;
  setSelection(event.detail);
  notice.value = null;
}

function cancelOperation() {
  operation?.controller.abort();
  operation = null;
  pending.value = '';
}

async function perform(kind, request, onSuccess) {
  if (pending.value || configurationError.value) return;
  const current = { controller: new AbortController() };
  operation = current;
  pending.value = kind;
  notice.value = null;
  try {
    const result = await request(current.controller.signal);
    if (operation === current && !current.controller.signal.aborted) onSuccess(result);
  } catch (error) {
    if (operation === current && !current.controller.signal.aborted) {
      notice.value = { kind: 'error', text: error.message || 'No se pudo completar la operación.' };
    }
  } finally {
    if (operation === current) {
      operation = null;
      pending.value = '';
    }
  }
}

async function submitCreate() {
  if (pending.value) return;
  createError.value = '';
  let title;
  try {
    title = requiredTitle(createTitle.value);
  } catch (error) {
    createError.value = error.message;
    createInput.value?.focus();
    return;
  }
  await perform('create', (signal) => createTodo(props.apiUrl, title, signal), (todo) => {
    createTitle.value = '';
    notice.value = { kind: 'success', text: 'Tarea creada correctamente.' };
    window.dispatchEvent(new CustomEvent('todo:created', { detail: todo }));
  });
}

async function submitUpdate() {
  if (pending.value || !selectedId.value) return;
  editError.value = '';
  const changes = {};
  try {
    if (editTitle.value !== (originalTitle.value ?? '')) {
      const title = requiredTitle(editTitle.value);
      if (title !== originalTitle.value) changes.title = title;
    }
    if (completedChoice.value !== '') {
      const completed = completedChoice.value === 'true';
      if (completed !== originalCompleted.value) changes.completed = completed;
    }
    if (Object.keys(changes).length === 0) {
      throw new EditorError('Cambia el título o el estado antes de guardar.');
    }
  } catch (error) {
    editError.value = error.message;
    return;
  }
  const id = selectedId.value;
  const revision = selectionRevision;
  await perform('update', (signal) => updateTodo(props.apiUrl, id, changes, signal), (todo) => {
    if (selectionRevision === revision) setSelection(todo);
    notice.value = { kind: 'success', text: 'Tarea actualizada correctamente.' };
    window.dispatchEvent(new CustomEvent('todo:updated', { detail: todo }));
  });
}

function askDelete() {
  if (!pending.value && selectedId.value && !configurationError.value) deleteDialog.value.showModal();
}

async function confirmDelete() {
  const id = selectedId.value;
  const revision = selectionRevision;
  if (!id || pending.value || !deleteDialog.value.open) return;
  closeConfirmation();
  await perform('delete', (signal) => deleteTodo(props.apiUrl, id, signal), () => {
    if (selectionRevision === revision) setSelection(null);
    notice.value = { kind: 'success', text: 'Tarea eliminada correctamente.' };
    window.dispatchEvent(new CustomEvent('todo:deleted', { detail: { id } }));
  });
}

watch(() => props.apiUrl, () => {
  cancelOperation();
  setSelection(null);
  notice.value = null;
});

onMounted(() => window.addEventListener('todo:selected', onSelected));
onUnmounted(() => {
  window.removeEventListener('todo:selected', onSelected);
  cancelOperation();
  closeConfirmation();
});
</script>

<template>
  <article class="editor" :aria-busy="Boolean(pending)">
    <header class="heading">
      <div>
        <h2>Editor de tareas</h2>
        <p>Crea una tarea o actualiza la que selecciones.</p>
      </div>
    </header>

    <p v-if="configurationError" class="notice warning" role="status">{{ configurationError }}</p>
    <p v-if="notice" :class="['notice', notice.kind]" :role="notice.kind === 'error' ? 'alert' : 'status'">
      {{ notice.text }}
    </p>
    <p v-if="pending" class="notice processing" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {{ pending === 'create' ? 'Creando tarea…' : pending === 'update' ? 'Guardando cambios…' : 'Eliminando tarea…' }}
    </p>

    <fieldset class="workspace" :disabled="Boolean(pending) || Boolean(configurationError)">
      <legend class="sr-only">Operaciones de tareas</legend>
      <form class="section create-section" novalidate @submit.prevent="submitCreate">
        <h3>Nueva tarea</h3>
        <label for="create-title">Título</label>
        <input id="create-title" ref="createInput" v-model="createTitle" name="title" type="text"
          autocomplete="off" placeholder="¿Qué necesitas hacer?" required
          :aria-invalid="Boolean(createError)" :aria-describedby="createError ? 'create-error' : undefined"
          @input="createError = ''" />
        <p v-if="createError" id="create-error" class="field-error" role="alert">{{ createError }}</p>
        <button class="primary create-button" type="submit">
          <span aria-hidden="true">＋</span> {{ pending === 'create' ? 'Creando…' : 'Crear tarea' }}
        </button>
      </form>

      <section class="section edit-section" aria-labelledby="edit-heading">
        <div class="section-heading">
          <h3 id="edit-heading">Tarea seleccionada</h3>
          <button v-if="selectedId" class="text-button" type="button" @click="setSelection(null)">Limpiar selección</button>
        </div>
        <div v-if="!selectedId" class="empty-state">
          <span class="empty-mark" aria-hidden="true">↖</span>
          <strong>Selecciona una tarea</strong>
          <p>Elige una en el Viewer para editar su título, cambiar su estado o eliminarla.</p>
        </div>
        <form v-else novalidate @submit.prevent="submitUpdate">
          <p class="selected-id"><span>ID</span> <code>{{ selectedId }}</code></p>
          <label for="edit-title">{{ originalTitle === null ? 'Nuevo título (opcional)' : 'Título' }}</label>
          <input id="edit-title" v-model="editTitle" name="title" type="text" autocomplete="off"
            placeholder="Escribe un nuevo título" :aria-invalid="Boolean(editError)"
            :aria-describedby="editError ? 'edit-error edit-hint' : 'edit-hint'" @input="editError = ''" />
          <p id="edit-hint" class="hint">{{ originalTitle === null
            ? 'Deja este campo vacío para conservar el título actual.'
            : 'Solo se enviarán los campos que cambies.' }}</p>
          <label for="edit-completed">Estado</label>
          <select id="edit-completed" v-model="completedChoice" @change="editError = ''">
            <option value="">Conservar estado actual</option>
            <option value="true">Completada</option>
            <option value="false">Pendiente</option>
          </select>
          <p v-if="editError" id="edit-error" class="field-error" role="alert">{{ editError }}</p>
          <div class="actions">
            <button class="primary" type="submit">{{ pending === 'update' ? 'Guardando…' : 'Guardar cambios' }}</button>
            <button class="danger" type="button" @click="askDelete">Eliminar tarea</button>
          </div>
        </form>
      </section>
    </fieldset>

    <dialog ref="deleteDialog" aria-labelledby="delete-heading" aria-describedby="delete-description">
      <h3 id="delete-heading">Eliminar tarea</h3>
      <p id="delete-description">La tarea <strong>{{ selectedId }}</strong> se eliminará de forma permanente.</p>
      <div class="actions">
        <button type="button" autofocus @click="closeConfirmation">Cancelar</button>
        <button class="danger confirm-delete" type="button" @click="confirmDelete">Confirmar eliminación</button>
      </div>
    </dialog>
  </article>
</template>

<style>
:host {
  display: block;
  min-width: 0;
  color: #f4f1fb;
  color-scheme: dark;
  font-family: 'Avenir Next', 'Segoe UI Variable', 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
}
*, *::before, *::after { box-sizing: border-box; }
h2, h3, p { margin: 0; }
.editor { min-width: 0; }
.heading { margin-bottom: 22px; }
h2 { font-size: 19px; font-weight: 650; letter-spacing: -.35px; }
.heading p { margin-top: 5px; color: #b0a8c3; font-size: 12px; }
.workspace { display: block; min-width: 0; padding: 0; margin: 0; border: 0; }
.section { min-width: 0; }
.edit-section { margin-top: 26px; padding-top: 23px; border-top: 1px solid #302a42; }
h3 { font-size: 14px; font-weight: 650; }
.create-section h3 { margin-bottom: 15px; }
label { display: block; margin: 16px 0 7px; color: #d9d3e7; font-size: 12px; font-weight: 600; }
input, select, button { font: inherit; }
input, select {
  display: block; width: 100%; min-height: 43px; padding: 10px 12px;
  border: 1px solid #423851; border-radius: 6px; background: #100e18; color: #f4f1fb; font-size: 13px;
}
input::placeholder { color: #a29ab1; }
input[aria-invalid="true"] { border-color: #ff8296; }
:focus-visible { outline: 2px solid #b49aff; outline-offset: 3px; }
button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px;
  padding: 9px 15px; border: 1px solid #514563; border-radius: 6px; background: #262031;
  color: #f4f1fb; font-size: 12px; font-weight: 600; cursor: pointer;
}
button:hover:enabled { background: #352b47; border-color: #a78bfa; }
button.primary { background: #7845df; border-color: #9367ea; color: #fff; }
button.primary:hover:enabled { background: #8a55ee; }
.create-button { width: 100%; margin-top: 14px; }
.create-button span { font-size: 19px; line-height: 1; }
button.danger { background: #361b2b; border-color: #734052; color: #ffc0cc; }
button.danger:hover:enabled { background: #512437; border-color: #ff8296; }
button:disabled, fieldset:disabled button { cursor: wait; opacity: .55; }
fieldset:disabled input, fieldset:disabled select { opacity: .65; }
.section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
button.text-button { min-height: 32px; padding: 5px 0; border: 0; background: transparent; color: #c2aaff; font-size: 11px; }
.empty-state { display: grid; justify-items: center; gap: 9px; margin-top: 16px; padding: 30px 22px; border: 1px dashed #514361; border-radius: 7px; background: #18131f; text-align: center; }
.empty-mark { display: grid; place-items: center; width: 35px; height: 35px; border: 1px solid #54416d; border-radius: 9px; color: #c2aaff; font-size: 23px; }
.empty-state strong { font-size: 13px; font-weight: 600; }
.empty-state p { max-width: 265px; color: #b0a8c3; font-size: 12px; line-height: 1.7; }
.selected-id { display: flex; gap: 10px; align-items: baseline; margin-top: 14px; color: #c4bbd4; font-size: 11px; }
.selected-id span { color: #9fddcb; }
code { overflow-wrap: anywhere; font-family: Consolas, monospace; }
.hint { margin-top: 7px; color: #b0a8c3; font-size: 11px; }
.field-error { margin-top: 8px; color: #ffb0c0; font-size: 12px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.notice { padding: 11px 13px; margin-bottom: 16px; border: 1px solid; border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
.success { border-color: #366857; background: #152a24; color: #a6edd2; }
.error { border-color: #734052; background: #321b27; color: #ffc0cc; }
.warning { border-color: #6a5838; background: #2c2419; color: #ecd19e; }
.processing { display: flex; align-items: center; gap: 9px; border-color: #55416f; background: #221a30; color: #d8c7ff; }
.spinner { width: 13px; height: 13px; flex-shrink: 0; border: 2px solid #645278; border-top-color: #d8c7ff; border-radius: 50%; animation: spin .8s linear infinite; }
dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 24px; border: 1px solid #655076; border-radius: 10px; background: #1b1427; color: #f4f1fb; box-shadow: 0 20px 80px #0009; }
dialog::backdrop { background: #07050cc9; }
dialog h3 { font-size: 18px; }
dialog p { margin-top: 12px; color: #c7bed8; font-size: 13px; overflow-wrap: anywhere; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 380px) { .actions > button { flex: 1 1 100%; } .empty-state { padding: 25px 16px; } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
