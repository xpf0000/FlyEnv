import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base from './Base'
import Apache from './Apache'
import Nginx from './Nginx'
import Caddy from './Caddy'

const PHP = reactive({
  enable: false,
  version: 'latest',
  ports: [{ in: '9000', out: '9000' }],
  async build() {
    const base = Base
    const mirror = base.mirrorHost()
    const info = PHP
    const php: any = {
      image: `${mirror}php:${info.version}-fpm`,
      ports: info.ports.map((p) => `${p.out}:${p.in}`),
      networks: ['flyenv-network']
    }
    const apache = Apache
    if (apache.enable) {
      php.volumes = [
        {
          type: 'bind',
          source: normalize(apache.wwwRoot),
          target: '/usr/local/apache2/htdocs',
          read_only: false
        }
      ]
    } else if (Nginx.enable) {
      php.volumes = [
        {
          type: 'bind',
          source: normalize(Nginx.wwwRoot),
          target: '/usr/share/nginx/html',
          read_only: false
        }
      ]
    } else if (Caddy.enable) {
      php.volumes = [
        {
          type: 'bind',
          source: normalize(Caddy.wwwRoot),
          target: '/srv',
          read_only: false
        }
      ]
    }
    return {
      php
    }
  }
})

export default PHP
