import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/components/Main.vue'
import Host from '@/components/Host/Index.vue'
import Nginx from '@/components/Nginx/Index.vue'
import PHP from '@/components/PHP/Index.vue'
import Mysql from '@/components/Mysql/Index.vue'
import Apache from '@/components/Apache/Index.vue'
import Memcached from '@/components/Memcached/Index.vue'
import Redis from '@/components/Redis/Index.vue'
import Nodejs from '@/components/Nodejs/Index.vue'
import Tools from '@/components/Tools/Index.vue'

const routes = [
  {
    path: '/',
    name: 'main',
    component: Main,
    redirect: '/host',
    children: [
      {
        path: '/host',
        component: Host
      },
      {
        path: '/nginx',
        component: Nginx
      },
      {
        path: '/php',
        component: PHP
      },
      {
        path: '/mysql',
        component: Mysql
      },
      {
        path: '/apache',
        component: Apache
      },
      {
        path: '/memcached',
        component: Memcached
      },
      {
        path: '/redis',
        component: Redis
      },
      {
        path: '/node',
        component: Nodejs
      },
      {
        path: '/tools',
        component: Tools
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
