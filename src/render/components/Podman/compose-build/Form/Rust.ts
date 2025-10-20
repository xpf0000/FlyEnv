import { reactive } from 'vue'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import { AppStore } from '@/store/app'

/**
 * Rust 应用程序的 Docker Compose 服务配置模块。
 */
const Rust = reactive({
  enable: false,
  version: 'latest', // 使用 Rust slim 镜像
  wwwRoot: '',
  // 默认使用 8080 端口，常见于 Rust Web 框架
  ports: [{ in: '8080', out: '8080' }],
  // 容器环境变量
  environment: {
    TZ: currentTimeZone,
    // 【持久化】Cargo Home 目录，包含依赖注册表和源码缓存
    CARGO_HOME: '/root/.cargo',
    // Rust 代理：使用国内源（如 ustc）
    RUSTUP_DIST_SERVER: 'https://mirrors.ustc.edu.cn/rust-static',
    RUSTUP_UPDATE_ROOT: 'https://mirrors.ustc.edu.cn/rust-static/rustup'
  },
  // 启动命令：构建 Release 版本并运行二进制文件
  command: `sh -c "cargo build --release && /app/target/release/$(basename $PWD)"`,

  check() {
    return ''
  },

  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment: any = {
      ...Rust.environment
    }

    const store = AppStore()
    // Rust 代理/源：如果不是中文环境，清除代理设置
    if (store.config.setup.lang !== 'zh') {
      environment.RUSTUP_DIST_SERVER = ''
      environment.RUSTUP_UPDATE_ROOT = ''
    }

    const rustService: any = {
      image: `${mirror}rust:${Rust.version}`,
      ports: Rust.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      // 容器内 Rust 项目的默认工作目录
      working_dir: '/app',
      command: Rust.command
    }

    const volumes: any[] = []

    const flyenvRustDir = join(dirname(base.dir), 'flyenv-docker-compose/rust')
    await fs.mkdirp(flyenvRustDir)

    // 1. 挂载 Cargo Home 目录 (CARGO_HOME)
    const rustCacheHostPath = join(flyenvRustDir, 'cargo_home')
    await fs.mkdirp(rustCacheHostPath)

    volumes.push({
      type: 'bind',
      source: rustCacheHostPath,
      target: Rust.environment.CARGO_HOME,
      read_only: false
    })

    // 2. 挂载项目代码目录
    if (Rust.wwwRoot) {
      const root = Rust.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    rustService.volumes = volumes

    return {
      rust: rustService
    }
  }
})

export default Rust
