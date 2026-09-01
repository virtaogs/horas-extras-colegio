import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serve o site em https://<usuario>.github.io/<repo>/ — por isso
// o base precisa ser "/<repo>/". Ajuste BASE_PATH no momento do build/deploy
// (veja package.json script "deploy") quando o nome do repositório for definido.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
})
