import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

const Java = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8080', out: '8080' }],
  environment: {
    TZ: currentTimeZone,
    JAVA_OPTS: '-Xms512m -Xmx1024m'
  },
  command: '',
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...Java.environment
    }

    const JavaService: any = {
      image: `${mirror}Javalang:${Java.version}`,
      ports: Java.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Java.command
    }

    const volumes: any[] = []

    if (Java.wwwRoot) {
      const root = Java.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    JavaService.volumes = volumes

    return {
      Java: JavaService
    }
  }
})

export default Java
