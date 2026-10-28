import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// A raiz publica o portal e a arena React fica em /selecao.html.
export default defineConfig({
  plugins:[react()],
  base:process.env.BASE_PATH || '/',
  input:{
    portal:resolve(import.meta.dirname,'index.html'),
    selecao:resolve(import.meta.dirname,'selecao.html')
  },
  build:{outDir:'dist',emptyOutDir:true}
});
