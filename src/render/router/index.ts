import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/components/Main.vue'
import { defineAsyncComponent } from 'vue'

const routes = [
  {
    path: '/',
    name: 'main',
    component: Main,
    redirect: '/host',
    children: [
      {
        path: '/host',
        component: defineAsyncComponent(() => import('@/components/Host/Index.vue'))
      },
      {
        path: '/nginx',
        component: defineAsyncComponent(() => import('@/components/Nginx/Index.vue'))
      },
      {
        path: '/caddy',
        component: defineAsyncComponent(() => import('@/components/Caddy/Index.vue'))
      },
      {
        path: '/php',
        component: defineAsyncComponent(() => import('@/components/PHP/Index.vue'))
      },
      {
        path: '/mysql',
        component: defineAsyncComponent(() => import('@/components/Mysql/Index.vue'))
      },
      {
        path: '/mariadb',
        component: defineAsyncComponent(() => import('@/components/MariaDB/Index.vue'))
      },
      {
        path: '/apache',
        component: defineAsyncComponent(() => import('@/components/Apache/Index.vue'))
      },
      {
        path: '/memcached',
        component: defineAsyncComponent(() => import('@/components/Memcached/Index.vue'))
      },
      {
        path: '/redis',
        component: defineAsyncComponent(() => import('@/components/Redis/Index.vue'))
      },
      {
        path: '/mongodb',
        component: defineAsyncComponent(() => import('@/components/MongoDB/Index.vue'))
      },
      {
        path: '/dns',
        component: defineAsyncComponent(() => import('@/components/DNS/Index.vue'))
      },
      {
        path: '/ftp',
        component: defineAsyncComponent(() => import('@/components/FTP/Index.vue'))
      },
      {
        path: '/node',
        component: defineAsyncComponent(() => import('@/components/Nodejs/Index.vue'))
      },
      {
        path: '/httpServe',
        component: defineAsyncComponent(() => import('@/components/HttpServe/Index.vue'))
      },
      {
        path: '/tools',
        component: defineAsyncComponent(() => import('@/components/Tools/Index.vue'))
      },
      {
        path: '/setup',
        component: defineAsyncComponent(() => import('@/components/Setup/Index.vue'))
      },
      {
        path: '/postgresql',
        component: defineAsyncComponent(() => import('@/components/PostgreSql/Index.vue'))
      },
      {
        path: '/java',
        component: defineAsyncComponent(() => import('@/components/Java/Index.vue'))
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory('/'),
  routes: routes
})

export default router
