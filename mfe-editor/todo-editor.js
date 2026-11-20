import { defineCustomElement } from 'vue';
import TodoEditor from './src/TodoEditor.ce.vue';

export const VERSION = '1.0.0';

if (!customElements.get('todo-editor')) {
  customElements.define('todo-editor', defineCustomElement(TodoEditor));
}
