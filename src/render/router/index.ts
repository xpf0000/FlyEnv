import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/components/Main.vue'
import { AppModules } from '@/core/App'
import { normalizeRouteComponent } from './route-component'

const routes = [
  {
    path: '/',
    name: 'main',
    component: Main,
    redirect: '/startup-group',
    children: [
      {
        path: '/setup',
        component: () => import('@/components/Setup/Index.vue')
      },
      {
        path: '/customer-module',
        component: () => import('@/components/CustomerModule/Index.vue')
      },
      ...AppModules.map((item) => {
        return {
          path: item.typeFlag,
          component: normalizeRouteComponent(item.index)
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
