import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { AppStore } from '@/store/app'
import { SoftInstalled } from '@/store/brew'
import XTerm from '@/util/XTerm'
import IPC from '@/util/IPC'

const { join, dirname } = require('path')
const { existsSync } = require('fs')

export const PgsqlExtensionSetup = reactive<{
  installEnd: boolean
  installing: boolean
  list: { [k: string]: any }
  tagVersion: string
  fetching: Partial<Record<string, boolean>>
  xterm: XTerm | undefined
  reFetch: () => void
}>({
  installEnd: false,
  installing: false,
  fetching: {},
  list: {},
  tagVersion: 'v0.7.4',
  xterm: undefined,
  reFetch: () => 0
})

export const Setup = (version: SoftInstalled) => {
  const appStore = AppStore()

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })

  const fetching = computed(() => {
    return PgsqlExtensionSetup.fetching?.[version.bin] ?? false
  })

  const fetchData = () => {
    if (fetching.value || PgsqlExtensionSetup?.list?.[version.bin]) {
      return
    }
    PgsqlExtensionSetup.fetching[version.bin] = true

    const num = version.version?.split('.').shift()
    const arr = [
      join(version.path, 'share/postgresql/extension/vector.control'),
      join(version.path, `share/postgresql@${num}/extension/vector.control`),
      join(version.path, `vector.dylib`),
      join(version.path, `vector.so`)
    ]
    const installed = arr.some((p) => existsSync(p))
    PgsqlExtensionSetup.list[version.bin] = reactive([
      {
        name: 'pgvector',
        installed
      }
    ])
    PgsqlExtensionSetup.fetching[version.bin] = false
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    delete PgsqlExtensionSetup?.list?.[version.bin]
    delete PgsqlExtensionSetup.fetching?.[version.bin]
    fetchData()
  }

  PgsqlExtensionSetup.reFetch = reGetData

  const handleEdit = async () => {
    if (PgsqlExtensionSetup.installing) {
      return
    }
    PgsqlExtensionSetup.installing = true
    PgsqlExtensionSetup.installEnd = false
    const params: string[] = []
    params.push(`export PATH="${dirname(version.bin)}:$PATH"`)
    params.push(`cd /tmp`)
    params.push(`sudo -S rm -rf pgvector`)
    params.push(
      `git clone --branch ${PgsqlExtensionSetup.tagVersion} https://github.com/pgvector/pgvector.git`
    )
    params.push(`cd pgvector`)
    params.push(`sudo -S make`)
    params.push(`sudo -S make install`)
    params.push(`sudo -S rm -rf pgvector`)
    if (proxyStr?.value) {
      params.unshift(proxyStr?.value)
    }
    console.log('params: ', params.join('\n'))
    await nextTick()
    const execXTerm = new XTerm()
    PgsqlExtensionSetup.xterm = execXTerm
    await execXTerm.mount(xtermDom.value!)
    await execXTerm.send(params)
    PgsqlExtensionSetup.installEnd = true
    reGetData()
  }

  const tableData = computed(() => {
    return PgsqlExtensionSetup.list?.[version.bin] ?? []
  })

  const showFooter = computed(() => {
    return PgsqlExtensionSetup.installing
  })

  const taskEnd = computed(() => {
    return PgsqlExtensionSetup.installEnd
  })

  const taskConfirm = () => {
    PgsqlExtensionSetup.installing = false
    PgsqlExtensionSetup.installEnd = false
    PgsqlExtensionSetup.xterm?.destory()
    delete PgsqlExtensionSetup.xterm
    return
  }

  const taskCancel = () => {
    PgsqlExtensionSetup.installing = false
    PgsqlExtensionSetup.installEnd = false
    PgsqlExtensionSetup.xterm?.stop()?.then(() => {
      PgsqlExtensionSetup.xterm?.destory()
      delete PgsqlExtensionSetup.xterm
    })
  }

  const xtermDom = ref<HTMLElement>()

  const fetchTagVersion = () => {
    let saved: any = localStorage.getItem(`pgvector-lasted-tag`)
    if (saved) {
      saved = JSON.parse(saved)
      const time = Math.round(new Date().getTime() / 1000)
      if (time < saved.expire) {
        PgsqlExtensionSetup.tagVersion = saved.data
        return
      }
    }
    IPC.send('app-fork:postgresql', 'fetchLastedTag').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        PgsqlExtensionSetup.tagVersion = res.data
        localStorage.setItem(
          `pgvector-lasted-tag`,
          JSON.stringify({
            expire: Math.round(new Date().getTime() / 1000) + 24 * 60 * 60,
            data: PgsqlExtensionSetup.tagVersion
          })
        )
      }
    })
  }

  fetchData()
  fetchTagVersion()

  onMounted(() => {
    if (PgsqlExtensionSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = PgsqlExtensionSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    PgsqlExtensionSetup.xterm && PgsqlExtensionSetup.xterm.unmounted()
  })

  return {
    handleEdit,
    tableData,
    reGetData,
    fetching,
    xtermDom,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel
  }
}
