import { version } from './package.json';
import { TodoViewer } from './src/todo-viewer.js';

export const VERSION = version;

if (!customElements.get('todo-viewer')) {
  customElements.define('todo-viewer', TodoViewer);
}
