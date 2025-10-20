import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import { normalize } from '@/util/path-browserify'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'

const Tomcat = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8080', out: '8080' }],
  environment: {
    TZ: currentTimeZone,
    CATALINA_OPTS: '-Xms512m -Xmx1024m'
  },
  check() {
    if (!Tomcat.wwwRoot) {
      return I18nT('host.placeholderRootPath') + I18nT('podman.require')
    }
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()
    const tomcat: any = {
      image: `${mirror}tomcat:${Tomcat.version}`,
      ports: Tomcat.ports.map((p) => `${p.out}:${p.in}`),
      networks: ['flyenv-network']
    }

    const root = Tomcat.wwwRoot
    const volumes = [
      {
        type: 'bind',
        source: normalize(root),
        target: '/usr/local/tomcat/webapps/ROOT',
        read_only: false
      }
    ]

    const environment: any = {
      ...Tomcat.environment
    }

    tomcat.volumes = volumes
    tomcat.environment = environment
    return {
      tomcat
    }
  }
})

export default Tomcat
