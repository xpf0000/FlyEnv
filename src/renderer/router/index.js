import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'main',
      component: require('@/components/Main').default,
      children: [
        {
          path: '/host',
          alias: '/',
          component: require('@/components/Host/Index').default,
          props: {
            status: 'active'
          }
        },
        {
          path: '/nginx',
          alias: '/',
          component: require('@/components/Nginx/Index').default,
          props: true
        },
        {
          path: '/php',
          alias: '/',
          component: require('@/components/PHP/Index').default,
          props: true
        },
        {
          path: '/mysql',
          alias: '/',
          component: require('@/components/Mysql/Index').default,
          props: true
        },
        {
          path: '/apache',
          alias: '/',
          component: require('@/components/Apache/Index').default,
          props: true
        },
        {
          path: '/memcached',
          alias: '/',
          component: require('@/components/Memcached/Index').default,
          props: true
        },
        {
          path: '/redis',
          alias: '/',
          component: require('@/components/Redis/Index').default,
          props: true
        },
        {
          path: '/node',
          alias: '/',
          component: require('@/components/Nodejs/Index').default,
          props: true
        },
        {
          path: '/tools',
          alias: '/',
          component: require('@/components/Tools/Index').default,
          props: true
        }
      ]
    },
    {
      path: '*',
      redirect: '/'
    }
  ]
})
