import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const localServer = { host: 'localhost', port: 5175, strictPort: true };
const viewerEntry = fileURLToPath(new URL('./todo-viewer.js', import.meta.url));

export default defineConfig({
  base: './',
  server: localServer,
  preview: localServer,
  build: {
    rolldownOptions: {
      input: viewerEntry,
      preserveEntrySignatures: 'strict',
    },
  },
  plugins: [{
    name: 'viewer-stable-entry',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (file) => file.type === 'chunk' && file.isEntry && file.name === 'todo-viewer',
      );
      if (!entry?.exports.includes('VERSION')) {
        this.error('La compilación debe generar una entrada ES del Viewer con VERSION.');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'todo-viewer.js',
        source: `export { VERSION } from './${entry.fileName}';\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
      });
    },
  }],
});
