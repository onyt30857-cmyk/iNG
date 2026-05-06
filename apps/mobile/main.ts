// uni-app 入口
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import AppDialog from './components/AppDialog.vue'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  // 全局组件:任意页面 template 末尾 <AppDialog /> 即可挂载产品级弹窗
  app.component('AppDialog', AppDialog)
  return { app }
}
