<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ $t('base.hostsTitle') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button>{{ $t('base.open') }}</el-button>
          <el-button>{{ $t('base.save') }}</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { AsyncComponentSetup, EditorConfigMake, EditorCreate } from '../../fn'
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { AppHost, AppStore } from '../../store/app'
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const appStore = AppStore()
  const conf = ref('')

  const input = ref()

  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const hostAlias = (item: AppHost) => {
    const alias = item.alias
      ? item.alias.split('\n').filter((n) => {
          return n && n.length > 0
        })
      : []
    const arr = Array.from(new Set(alias)).sort()
    arr.unshift(item.name)
    return arr
  }

  const initConf = () => {
    const base = `127.0.0.1     localhost
::1\t        localhost`
    let host = ''
    if (appStore?.config?.setup?.hosts?.write) {
      const list = appStore.hosts
      for (let item of list) {
        const alias = hostAlias(item)
        alias.forEach((h) => {
          host += `127.0.0.1     ${h}\n`
          host += `::1     ${h}\n`
        })
      }
    }
    if (host) {
      host = base + '\n#X-HOSTS-BEGIN#\n' + host + '#X-HOSTS-END#'
    } else {
      host = base
    }
    conf.value = host
  }

  initConf()

  const initEditor = () => {
    if (!monacoInstance) {
      const dom: HTMLElement = input?.value as any
      if (!dom || !dom?.style) {
        return
      }
      monacoInstance = EditorCreate(dom, EditorConfigMake(conf.value, false, 'off'))
    } else {
      monacoInstance.setValue(conf.value)
    }
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
