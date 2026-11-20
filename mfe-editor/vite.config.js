import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const shellOrigin = 'https://d1ykub9gcq8bmq.cloudfront.net';
const server = {
  host: 'localhost',
  port: 5174,
  strictPort: true,
  cors: { origin: [/^https?:\/\/localhost(?::\d+)?$/, /^https?:\/\/127\.0\.0\.1(?::\d+)?$/, shellOrigin] },
};

export default defineConfig({
  base: './',
  server,
  preview: server,
  plugins: [vue(), {
    name: 'editor-public-entry',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
      if (!entry?.exports.includes('VERSION')) {
        this.error('La entrada compilada debe exportar VERSION.');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'todo-editor.js',
        source: `export { VERSION } from './${entry.fileName}';\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
      });
    },
  }],
  build: {
    rolldownOptions: {
      input: fileURLToPath(new URL('./todo-editor.js', import.meta.url)),
      preserveEntrySignatures: 'strict',
    },
  },
});
