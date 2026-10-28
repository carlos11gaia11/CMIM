import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// O workflow define BASE_PATH=/nome-do-repositorio/ automaticamente.
export default defineConfig({
  plugins:[react()],
  base:process.env.BASE_PATH || '/',
  build:{outDir:'dist',emptyOutDir:true}
});
