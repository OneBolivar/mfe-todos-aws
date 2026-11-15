import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { getHistory, getTodo, getTodos, todosEndpoint, ViewerError } from './api.js';
import { viewerStyles } from './viewer-styles.js';

const CHANGES = ['todo:created', 'todo:updated', 'todo:deleted'];
const HISTORY_DELAYS = [1000, 2200];
const FILTERS = [['all', 'Todas'], ['pending', 'Pendientes'], ['completed', 'Completadas']];
const EVENT_LABELS = new Map([
  ['todo.created', 'Tarea creada'],
  ['todo.updated', 'Tarea actualizada'],
  ['todo.completed', 'Tarea completada'],
  ['todo.deleted', 'Tarea eliminada'],
]);
const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function emptyResource() {
  return { value: null, status: 'idle', error: '' };
}

function ready(value) {
  return { value, status: 'ready', error: '' };
}

function searchable(text) {
  return text.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-CO');
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function statusChip(completed) {
  return html`<span class="chip ${completed ? 'completed' : 'pending'}">
    <span class="dot" aria-hidden="true"></span>${completed ? 'Completada' : 'Pendiente'}
  </span>`;
}

function dateText(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp)
    ? html`<time datetime=${value} title=${value}>${dateFormat.format(timestamp)}</time>`
    : 'Sin fecha';
}

function loading(message) {
  return html`<p class="notice loading" role="status"><span class="spinner" aria-hidden="true"></span>${message}</p>`;
}

function problem(title, resource, retry) {
  return html`<div class="problem">
    <div role="alert"><strong>${title}</strong><p>${resource.error}</p></div>
    ${retry ? html`<button type="button" class="subtle" @click=${retry}>Reintentar</button>` : nothing}
  </div>`;
}

export class TodoViewer extends LitElement {
  static styles = viewerStyles;

  static properties = {
    apiUrl: { type: String, attribute: 'api-url' },
    _query: { state: true },
    _filter: { state: true },
    _selectedId: { state: true },
    _todos: { state: true },
    _detail: { state: true },
    _history: { state: true },
    _checkingHistory: { state: true },
  };

  _requests = new Map();
  _collection = null;
  _activeApiUrl;

  constructor() {
    super();
    this.apiUrl = '';
    this._query = '';
    this._filter = 'all';
    this._todos = emptyResource();
    this._clearSelection();
  }

  connectedCallback() {
    super.connectedCallback();
    for (const type of CHANGES) window.addEventListener(type, this._onTodoChange);
    this._syncApi();
  }

  disconnectedCallback() {
    for (const type of CHANGES) window.removeEventListener(type, this._onTodoChange);
    this._abort('_todos');
    this._clearSelection();
    this._activeApiUrl = undefined;
    this._collection = null;
    super.disconnectedCallback();
  }

  updated(changed) {
    if (this.isConnected && changed.has('apiUrl')) this._syncApi();
  }

  _syncApi() {
    const configuredUrl = this.apiUrl ?? '';
    if (configuredUrl === this._activeApiUrl) return;
    this._activeApiUrl = configuredUrl;
    this._abort('_todos');
    this._clearSelection();
    this._collection = null;
    this._todos = emptyResource();
    try {
      this._collection = todosEndpoint(configuredUrl);
    } catch (error) {
      this._todos = { value: null, status: 'error', error: error.message };
      return;
    }
    void this._loadTodos();
  }

  _abort(key) {
    this._requests.get(key)?.abort();
    this._requests.delete(key);
  }

  async _load(key, read) {
    this._abort(key);
    const request = new AbortController();
    this._requests.set(key, request);
    this[key] = { ...this[key], status: 'loading', error: '' };

    try {
      const value = await read(request.signal);
      if (request.signal.aborted) return;
      this[key] = ready(value);
      return value;
    } catch (error) {
      if (request.signal.aborted) return;
      const message = error instanceof ViewerError ? error.message : 'Ocurrió un error al consultar la API.';
      this[key] = { ...this[key], status: 'error', error: message };
    } finally {
      if (this._requests.get(key) === request) this._requests.delete(key);
    }
  }

  async _loadTodos() {
    if (!this._collection) return;
    const todos = await this._load('_todos', (signal) => getTodos(this._collection, signal));
    if (todos && this._selectedId && !todos.some(({ id }) => id === this._selectedId)) {
      this._clearSelection();
    }
  }

  _loadDetail() {
    const id = this._selectedId;
    return this._load('_detail', (signal) => getTodo(this._collection, id, signal));
  }

  _loadHistory(waitForChange = false) {
    const id = this._selectedId;
    const collection = this._collection;
    const previous = this._history.value;
    this._checkingHistory = false;

    return this._load('_history', async (signal) => {
      try {
        let events = await getHistory(collection, id, signal);
        signal.throwIfAborted();
        const baseline = JSON.stringify(previous ?? events);

        for (const ms of HISTORY_DELAYS) {
          if (events.length && (!waitForChange || JSON.stringify(events) !== baseline)) break;
          this._history = ready(events);
          this._checkingHistory = true;
          await delay(ms, signal);
          events = await getHistory(collection, id, signal);
          signal.throwIfAborted();
        }
        return events;
      } finally {
        if (!signal.aborted) this._checkingHistory = false;
      }
    });
  }

  _clearSelection() {
    this._abort('_detail');
    this._abort('_history');
    this._selectedId = null;
    this._detail = emptyResource();
    this._history = emptyResource();
    this._checkingHistory = false;
  }

  _select(id) {
    if (id !== this._selectedId) {
      this._clearSelection();
      this._selectedId = id;
      void this._loadDetail();
      void this._loadHistory();
    }
    window.dispatchEvent(new CustomEvent('todo:selected', { detail: { id } }));
  }

  _refresh = () => {
    void this._loadTodos();
    if (this._selectedId) {
      void this._loadDetail();
      void this._loadHistory();
    }
  };

  _onTodoChange = (event) => {
    if (!this._collection) return;
    const id = event.detail?.id;
    if (this._selectedId) {
      if (event.type === 'todo:deleted' && id === this._selectedId) this._clearSelection();
      if (event.type === 'todo:updated' && (id === this._selectedId || id == null)) {
        void this._loadDetail();
        void this._loadHistory(true);
      }
    }
    void this._loadTodos();
  };

  render() {
    const todos = this._todos.value ?? [];
    const completed = todos.filter((todo) => todo.completed).length;
    const selected = todos.find(({ id }) => id === this._selectedId);
    const count = (value) => this._todos.value ? value : '—';

    return html`
      <div class="list-heading">
        <h3 id="todo-list-heading">Tareas</h3>
        <button class="refresh" type="button" @click=${this._refresh} ?disabled=${!this._collection}
          aria-label="Actualizar tareas"><span aria-hidden="true">↻</span> Actualizar</button>
      </div>
      <dl class="metrics">
        <div class="metric total"><dt>Total</dt><dd>${count(todos.length)}</dd></div>
        <div class="metric open"><dt>Pendientes</dt><dd>${count(todos.length - completed)}</dd></div>
        <div class="metric done"><dt>Completadas</dt><dd>${count(completed)}</dd></div>
      </dl>
      <div class="workspace">
        <section aria-labelledby="todo-list-heading" class="list-section">
          <div class="list-tools">
            <label for="todo-search" class="sr-only">Buscar por título</label>
            <input id="todo-search" type="search" placeholder="Buscar por título" .value=${this._query}
              @input=${(event) => { this._query = event.target.value; }} />
            <div class="filters" role="group" aria-label="Filtrar por estado">
              ${FILTERS.map(([value, label]) => html`
                <button type="button" aria-pressed=${String(value === this._filter)}
                  @click=${() => { this._filter = value; }}>${label}</button>
              `)}
            </div>
          </div>
          ${this._renderList(todos)}
        </section>
        <p class="sr-only" role="status">${selected ? `Seleccionaste «${selected.title}».` : nothing}</p>
        ${this._renderDetail()}
      </div>
    `;
  }

  _renderList(todos) {
    const query = searchable(this._query);
    const visible = todos.filter(({ title, completed }) =>
      (this._filter === 'all' || completed === (this._filter === 'completed'))
      && (!query || searchable(title).includes(query)),
    );

    return html`
      ${this._todos.status === 'loading' ? loading('Cargando tareas…') : nothing}
      ${this._todos.status === 'error'
        ? problem('No se pudieron cargar las tareas', this._todos, this._collection && (() => this._loadTodos()))
        : nothing}
      ${this._todos.status === 'ready' && todos.length > 0
        ? html`<p class="results" role="status">${visible.length} de ${todos.length} tareas</p>`
        : nothing}
      ${visible.length ? html`
        <ul class="tasks" aria-label="Resultados de tareas" role="list">
          ${repeat(visible, ({ id }) => id, (todo) => html`
            <li><button type="button" class="task" aria-pressed=${String(this._selectedId === todo.id)}
              aria-controls="todo-detail" @click=${() => this._select(todo.id)}>
              <span class="task-title">${todo.title}</span>${statusChip(todo.completed)}
            </button></li>
          `)}
        </ul>
      ` : this._todos.status === 'ready' ? html`
        <p class="notice empty">${todos.length
          ? 'Ninguna tarea coincide con la búsqueda y los filtros.'
          : 'Aún no hay tareas.'}</p>
      ` : nothing}
    `;
  }

  _renderDetail() {
    const todo = this._detail.value;

    return html`
      <section id="todo-detail" class="detail" aria-labelledby="todo-detail-heading">
        <h3 id="todo-detail-heading">Detalle de tarea</h3>
        ${this._selectedId ? html`
          ${this._detail.status === 'loading' ? loading('Cargando detalle…') : nothing}
          ${this._detail.status === 'error'
            ? problem('No se pudo cargar el detalle', this._detail, () => this._loadDetail()) : nothing}
          ${todo ? html`
            <div class="detail-title"><h4>${todo.title}</h4>${statusChip(todo.completed)}</div>
            <dl class="metadata">
              <div class="id"><dt>ID</dt><dd><code>${todo.id}</code></dd></div>
              <div><dt>Creación</dt><dd>${dateText(todo.createdAt)}</dd></div>
              <div><dt>Actualización</dt><dd>${dateText(todo.updatedAt)}</dd></div>
            </dl>
          ` : nothing}
          ${this._renderHistory()}
        ` : html`<p class="notice">Selecciona una tarea para ver sus datos y su historial.</p>`}
      </section>
    `;
  }

  _renderHistory() {
    const events = this._history.value ?? [];

    return html`
      <section class="history" aria-labelledby="todo-history-heading">
        <div class="history-heading">
          <h4 id="todo-history-heading">Historial de auditoría</h4>
          <button class="subtle" type="button" @click=${() => this._loadHistory()}>Actualizar historial</button>
        </div>
        ${this._history.status === 'loading' ? loading('Cargando historial…') : nothing}
        ${this._history.status === 'error'
          ? problem('No se pudo cargar el historial', this._history, () => this._loadHistory()) : nothing}
        ${events.length ? html`
          <ol class="timeline" aria-label="Eventos de auditoría" role="list">
            ${events.map(({ eventType, occurredAt }) => html`
              <li><strong title=${eventType}>${EVENT_LABELS.get(eventType) ?? eventType}</strong>${dateText(occurredAt)}</li>
            `)}
          </ol>
        ` : this._history.status === 'ready' && !this._checkingHistory
          ? html`<p class="notice" role="status">Aún no hay eventos de auditoría.</p>` : nothing}
        ${this._checkingHistory ? loading('Comprobando si llegaron nuevos eventos…') : nothing}
      </section>
    `;
  }
}
