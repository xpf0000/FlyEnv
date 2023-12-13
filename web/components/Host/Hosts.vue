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
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
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
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { AsyncComponentSetup } from '../../fn'
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { AppHost, AppStore } from '../../store/app'
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const appStore = AppStore()
  const conf = ref('')

  const input = ref()

  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const hostAlias = (item: AppHost) => {
    let alias = item.alias
      ? item.alias.split('\n').filter((n) => {
          return n && n.length > 0
        })
      : []
    return [item.name, ...alias].join(' ')
  }

  const initConf = () => {
    const base = `127.0.0.1     localhost
::1\t        localhost`
    let host = ''
    if (appStore?.config?.setup?.hosts?.write) {
      const list = appStore.hosts
      for (let item of list) {
        let alias = hostAlias(item)
        host += `127.0.0.1     ${alias}\n`
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
      monacoInstance = editor.create(dom, {
        value: conf.value,
        language: 'ini',
        theme: 'vs-dark',
        scrollBeyondLastLine: true,
        overviewRulerBorder: true,
        automaticLayout: true
      })
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

<style lang="scss">
  .host-vhost {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: hidden;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      flex-direction: column;

      > .block {
        width: 100%;
        flex: 1;
        overflow: hidden;
      }
      .tool {
        flex-shrink: 0;
        padding: 30px 0 20px 0;
      }
    }
  }
</style>
