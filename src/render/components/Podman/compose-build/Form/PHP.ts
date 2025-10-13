import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base from './Base'
import Apache from './Apache'

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
      ports: info.ports.map((p) => `${p.out}:${p.in}`)
    }
    const apache = Apache
    if (apache.enable) {
      php.volumes = [
        {
          type: 'bind',
          source: normalize(apache.wwwRoot),
          target: '/var/www/html',
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
