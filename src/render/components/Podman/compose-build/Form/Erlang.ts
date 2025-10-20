import { reactive } from 'vue'
import { normalize } from '@/util/path-browserify'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

const Erlang = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8080', out: '8080' }], // Default Erlang HTTP port
  environment: {
    TZ: currentTimeZone,
    ERLANG_HOME: '/usr/local/lib/erlang',
    LANG: 'en_US.UTF-8',
    ERL_AFLAGS: '-kernel shell_history enabled'
  },
  command: `sh -c "rebar3 compile && rebar3 shell"`, // Default command for development
  check() {
    return ''
  },
  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment = {
      ...Erlang.environment
    }

    const erlang: any = {
      image: `${mirror}erlang:${Erlang.version}`,
      ports: Erlang.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Erlang.command
    }

    if (Erlang.wwwRoot) {
      const root = Erlang.wwwRoot
      erlang.volumes = [
        {
          type: 'bind',
          source: normalize(root),
          target: '/app',
          read_only: false
        }
      ]
    }

    return {
      erlang
    }
  }
})

export default Erlang
