import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 백엔드(Spring Boot) 연동 시 VITE_USE_MOCK=false 로 실행
    proxy: { '/api': 'http://localhost:8080' },
  },
});
