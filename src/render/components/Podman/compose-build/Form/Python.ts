import { reactive } from 'vue'
import { dirname, join, normalize } from '@/util/path-browserify'
import { fs } from '@/util/NodeFn'
import Base, { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'

const Python = reactive({
  enable: false,
  version: 'latest',
  wwwRoot: '',
  ports: [{ in: '8000', out: '8000' }],
  environment: {
    TZ: currentTimeZone,
    PYTHONDONTWRITEBYTECODE: '1',
    PIP_CACHE_DIR: '/root/.pip/cache'
  },
  command: `sh -c "pip install -r requirements.txt && python app.py"`,

  check() {
    return ''
  },

  async build() {
    const base = Base
    const mirror = base.mirrorHost()

    const environment: any = {
      ...Python.environment
    }

    const pythonService: any = {
      image: `${mirror}python:${Python.version}`,
      ports: Python.ports.map((p) => `${p.out}:${p.in}`),
      environment,
      networks: ['flyenv-network'],
      working_dir: '/app',
      command: Python.command
    }

    const volumes: any[] = []

    const flyenvPythonDir = join(dirname(base.dir), 'flyenv-docker-compose/python')
    await fs.mkdirp(flyenvPythonDir)

    // 1. 挂载 Pip 缓存目录 (PIP_CACHE_DIR)
    const pythonCacheHostPath = join(flyenvPythonDir, 'pip_cache')
    await fs.mkdirp(pythonCacheHostPath)

    volumes.push({
      type: 'bind',
      source: pythonCacheHostPath,
      target: Python.environment.PIP_CACHE_DIR,
      read_only: false
    })

    // 2. 挂载项目代码目录
    if (Python.wwwRoot) {
      const root = Python.wwwRoot
      volumes.push({
        type: 'bind',
        source: normalize(root),
        target: '/app',
        read_only: false
      })
    }

    pythonService.volumes = volumes

    return {
      python: pythonService
    }
  }
})

export default Python
