import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API + Socket.IO calls are proxied to the Express server in development
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true },
    },
  },
});
