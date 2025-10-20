import { reactive } from 'vue'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

const Perl = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8080', out: '8080' }],
  environment: {
    TZ: currentTimeZone,
    PERL_CPANM_HOME: '/root/.cpanm'
  },
  command: ``,
  check() {
    return ''
  },

  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment: any = {
      ...Perl.environment
    }

    const perlService: any = {
      image: `${mirror}perl:${Perl.version}`,
      ports: Perl.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Perl.command
    }

    const volumes: any[] = []

    const flyenvPerlDir = join(dirname(base.dir), 'flyenv-docker-compose/perl')
    await fs.mkdirp(flyenvPerlDir)

    const perlCacheHostPath = join(flyenvPerlDir, 'cpanm_cache')
    await fs.mkdirp(perlCacheHostPath)

    volumes.push({
      type: 'bind',
      source: perlCacheHostPath,
      target: Perl.environment.PERL_CPANM_HOME,
      read_only: false
    })

    if (Perl.wwwRoot) {
      const root = Perl.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    perlService.volumes = volumes

    return {
      perl: perlService
    }
  }
})

export default Perl
