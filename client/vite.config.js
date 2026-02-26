import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/status': { target: 'http://localhost:3000' },
      '/profiles': { target: 'http://localhost:3000' },
      '/connect': { target: 'http://localhost:3000' },
      '/disconnect': { target: 'http://localhost:3000' },
      '/plug-in': { target: 'http://localhost:3000' },
      '/plug-out': { target: 'http://localhost:3000' },
      '/start-session': { target: 'http://localhost:3000' },
      '/stop-session': { target: 'http://localhost:3000' },
      '/fault': { target: 'http://localhost:3000' },
      '/available': { target: 'http://localhost:3000' },
      '/set-profile': { target: 'http://localhost:3000' },
    },
  },
})
