import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@web/components/Main.vue'
import { defineAsyncComponent } from 'vue'
import { AppModules } from '@web/core/App'

const routes = [
  {
    path: '/',
    name: 'main',
    component: Main,
    redirect: '/hosts',
    children: [
      {
        path: '/setup',
        component: defineAsyncComponent(() => import('@web/components/Setup/Index.vue'))
      },
      ...AppModules.map((item) => {
        return {
          path: item.typeFlag,
          component: item.index
        }
      })
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory('/'),
  routes: routes
})

export default router
