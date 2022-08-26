import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/components/Main.vue'

const routes = [
  {
    path: '/',
    name: 'main',
    component: Main,
    redirect: '/host',
    children: [
      {
        path: '/host',
        component: () => import('@/components/Host/Index.vue')
      },
      {
        path: '/nginx',
        component: () => import('@/components/Nginx/Index.vue')
      },
      {
        path: '/php',
        component: () => import('@/components/PHP/Index.vue')
      },
      {
        path: '/mysql',
        component: () => import('@/components/Mysql/Index.vue')
      },
      {
        path: '/apache',
        component: () => import('@/components/Apache/Index.vue')
      },
      {
        path: '/memcached',
        component: () => import('@/components/Memcached/Index.vue')
      },
      {
        path: '/redis',
        component: () => import('@/components/Redis/Index.vue')
      },
      {
        path: '/node',
        component: () => import('@/components/Nodejs/Index.vue')
      },
      {
        path: '/httpServe',
        component: () => import('@/components/HttpServe/Index.vue')
      },
      {
        path: '/tools',
        component: () => import('@/components/Tools/Index.vue')
      },
      {
        path: '/setup',
        component: () => import('@/components/Setup/Index.vue')
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: '404',
    component: () => import('../components/HelloWorld.vue'),
    hidden: true
  }
]

const router = createRouter({
  history: createWebHashHistory('/'),
  routes: routes
})

export default router
