import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { fs } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import base from './Base'

const MySQL = reactive({
  enable: false,
  persistence: false,
  version: 'latest',
  ports: [{ in: '3306', out: '3306' }],
  volumes: [
    {
      type: 'volume',
      source: './flyenv-docker-compose/mysql/data',
      target: '/var/lib/mysql'
    }
  ],
  environment: {
    TZ: currentTimeZone,
    MYSQL_ROOT_PASSWORD: 'root',
    MYSQL_DATABASE: '',
    MYSQL_USER: '',
    MYSQL_PASSWORD: ''
  },
  check() {
    if (!MySQL.environment.MYSQL_ROOT_PASSWORD) {
      return I18nT('mysql.rootPassword') + I18nT('podman.require')
    }
    return ''
  },
  async build() {
    const mirror = base.mirrorHost()

    // 设置环境变量
    const environment = {
      ...MySQL.environment
    }

    const mysql: any = {
      image: `${mirror}mysql:${MySQL.version}`,
      ports: MySQL.ports.map((p) => `${p.out}:${p.in}`),
      environment
    }

    // 如果需要持久化数据，创建数据目录
    if (MySQL.persistence) {
      mysql.volumes = MySQL.volumes
      await fs.mkdirp(join(dirname(base.dir), 'flyenv-docker-compose/mysql/data'))
    }

    return {
      mysql
    }
  }
})

export default MySQL
