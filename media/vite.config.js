import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // This is still correct as the tags are prefixed with `vscode-`
          isCustomElement: (tag) => tag.includes('vscode-'),
        },
      },
    }),tailwindcss(),
]
});
