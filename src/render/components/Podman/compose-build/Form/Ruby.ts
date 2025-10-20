import { reactive } from 'vue'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

/**
 * Ruby 应用程序的 Docker Compose 服务配置模块。
 */
const Ruby = reactive({
  enable: false,
  version: 'latest', // 使用 Ruby slim 镜像
  wwwRoot: '',
  // 默认使用 3000 端口，Ruby on Rails 标准端口
  ports: [{ in: '3000', out: '3000' }],
  // 容器环境变量
  environment: {
    TZ: currentTimeZone,
    // 【持久化】Bundler 安装 Gems 的目录
    BUNDLE_PATH: '/usr/local/bundle',
    // 允许 Bundler 以非 root 方式安装
    BUNDLE_FORCE_RUBY_PLATFORM: '1'
  },
  // 启动命令：安装 Gems 并运行 Rails Server
  command: `sh -c "bundle install && bundle exec rails server -b 0.0.0.0"`,

  check() {
    return ''
  },

  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment: any = {
      ...Ruby.environment
    }

    const rubyService: any = {
      image: `${mirror}ruby:${Ruby.version}`,
      ports: Ruby.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Ruby.command
    }

    const volumes: any[] = []

    const flyenvRubyDir = join(dirname(base.dir), 'flyenv-docker-compose/ruby')
    await fs.mkdirp(flyenvRubyDir)

    // 1. 挂载 Bundler Gems 目录 (BUNDLE_PATH)
    const rubyGemsHostPath = join(flyenvRubyDir, 'gems_bundle')
    await fs.mkdirp(rubyGemsHostPath)

    volumes.push({
      type: 'bind',
      source: rubyGemsHostPath,
      target: Ruby.environment.BUNDLE_PATH,
      read_only: false
    })

    // 2. 挂载项目代码目录
    if (Ruby.wwwRoot) {
      const root = Ruby.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    rubyService.volumes = volumes

    return {
      ruby: rubyService
    }
  }
})

export default Ruby
