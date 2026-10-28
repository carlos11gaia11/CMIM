import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Portal CMIM e selecao de campeoes sao duas entradas de paginas independentes.
export default defineConfig({
  plugins:[react()],
  base:process.env.BASE_PATH || '/',
  build:{
    outDir:'dist',
    emptyOutDir:true,
    rolldownOptions:{
      input:{
        portal:resolve(import.meta.dirname,'index.html'),
        selecao:resolve(import.meta.dirname,'selecao.html')
      }
    }
  }
});
