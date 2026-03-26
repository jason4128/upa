import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 根據目前的模式（development 或 production）載入環境變數
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // 關鍵設定：部署到 GitHub Pages 的子目錄路徑
    // 如果您的 Repo 名稱是 upa，這裡必須是 '/upa/'
    base: '/upa/',

    plugins: [
      react(),
      tailwindcss(),
    ],

    define: {
      // 確保在程式碼中可以使用 process.env.GEMINI_API_KEY
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        // 設定 @ 指向專案根目錄，方便 import 元件
        '@': path.resolve(__dirname, './'),
      },
    },

    server: {
      // 確保在 AI Studio 環境中開發時 HMR 正常運作
      hmr: process.env.DISABLE_HMR !== 'true',
      host: true,
    },

    build: {
      // 編譯後的輸出目錄，這要與部署腳本中的路徑一致
      outDir: 'dist',
    },
  };
});
