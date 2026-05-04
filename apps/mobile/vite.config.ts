// uni-app 的 vite 配置
// 用 H5 调试时 dev server 在 5173/8080,后端 baseURL 在 api/client.ts 里写死 localhost:3000

import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
