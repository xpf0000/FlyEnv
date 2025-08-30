import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { AppStore } from '@/store/app'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { join, basename, dirname } from '@/util/path-browserify'
import { clipboard, fs } from '@/util/NodeFn'
import localForage from 'localforage'
import { chooseFile } from '@/util/File'

export const PodmanSetup = reactive({
  installEnd: false,
  installing: false,
  xterm: undefined,
  podmanBin: undefined,
  reFetch: () => 0,
  initPodmanBin: () => {
    localForage
      .getItem<string>('flyenv-podman-bin-dir')
      .then((res: string) => {
        if (res) {
          PodmanSetup.podmanBin = res
        }
      })
      .catch()
  },
  setPodmanBin: () => {
    chooseFile()
      .then((path: string) => {
        PodmanSetup.podmanBin = path
      })
      .catch()
  },
  checkPodman() {
    if (!window.Server.PodmanBin) {
      IPC.send('app-check-podman').then((key) => {
        IPC.off(key)
      })
    }
  }
})

export const Setup = (typeFlag) => {
  const appStore = AppStore()

  const checkPodman = computed(() => {
    if (!appStore.envIndex) return false
    return !!window.Server.PodmanBin
  })

  const showPodmanError = computed(() => {
    if (!appStore.envIndex) return false
    return window?.Server?.PodmanBin && window?.Server?.PodmanError
  })

  const podmanBin = computed(() => window?.Server?.PodmanBin ?? '')
  const podmanError = computed(() => window?.Server?.PodmanError ?? '')

  const fetching = ref(false)

  const tableData = computed(() => {
    // 这里只做演示，实际可根据 Podman 镜像/容器等数据填充
    return [{ name: 'podman', version: '5.0.0', installed: checkPodman.value }]
  })

  const fetchCommand = (row) => {
    return row.installed ? 'brew uninstall podman' : 'brew install podman'
  }

  const copyCommand = (row) => {
    const command = fetchCommand(row)
    clipboard.writeText(command)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const handlePodmanVersion = async (row) => {
    if (PodmanSetup.installing) return
    PodmanSetup.installing = true
    PodmanSetup.installEnd = false
    const fn = row.installed ? 'uninstall' : 'install'
    const sh = join(window.Server.Static!, 'sh/podman-cmd.sh')
    const copyfile = join(window.Server.Cache!, 'podman-cmd.sh')
    const exists = await fs.existsSync(copyfile)
    if (exists) await fs.remove(copyfile)
    await fs.copyFile(sh, copyfile)
    await fs.chmod(copyfile, '0777')
    const params = [`${copyfile} ${fn} ${row.name};`]
    await nextTick()
    const execXTerm = new XTerm()
    PodmanSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    PodmanSetup.installEnd = true
    PodmanSetup.installing = false
  }

  const xtermDom = ref()

  const installPodman = async () => {
    if (PodmanSetup.installing) return
    PodmanSetup.installEnd = false
    PodmanSetup.installing = true
    await nextTick()
    const file = join(window.Server.Static!, 'sh/podman-install.sh')
    const copyFile = join(window.Server.Cache!, basename(file))
    await fs.copyFile(file, copyFile)
    await fs.chmod(copyFile, '0755')
    const execXTerm = new XTerm()
    PodmanSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    const command = [`cd "${dirname(copyFile)}"`, `./${basename(file)}`]
    await execXTerm.send(command)
    PodmanSetup.installEnd = true
    PodmanSetup.installing = false
  }

  onMounted(() => {
    if (PodmanSetup.installing) {
      nextTick().then(() => {
        const execXTerm = PodmanSetup.xterm
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    PodmanSetup?.xterm?.unmounted?.()
  })

  return {
    installPodman,
    handlePodmanVersion,
    tableData,
    checkPodman,
    fetching,
    xtermDom,
    fetchCommand,
    copyCommand,
    showPodmanError,
    podmanBin,
    podmanError
  }
}
