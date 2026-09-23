import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/components/Main.vue'
import { AppModules } from '@/core/AppModules'
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

const registeredPluginRoutes = new Set<string>()
export function registerPluginRoutes() {
  for (const item of AppModules) {
    if (
      !item.plugin ||
      registeredPluginRoutes.has(item.typeFlag) ||
      router.hasRoute(item.typeFlag)
    ) {
      continue
    }
    router.addRoute('main', {
      // The route is named after the typeFlag so it can be removed again when
      // the plugin is disabled or uninstalled (hot reload without restart).
      name: item.typeFlag,
      path: item.typeFlag,
      component: normalizeRouteComponent(item.index)
    })
    registeredPluginRoutes.add(item.typeFlag)
  }
}

export function unregisterPluginRoute(typeFlag: string) {
  if (!registeredPluginRoutes.has(typeFlag)) return
  if (router.hasRoute(typeFlag)) router.removeRoute(typeFlag)
  registeredPluginRoutes.delete(typeFlag)
}

export default router
