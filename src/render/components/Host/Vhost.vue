<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="75%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
          <span class="ml-15">{{ $t('base.vhostConTitle') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
          <el-button @click="saveConfig">{{ $t('base.save') }}</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import Base from '@/core/Base'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { AppStore } from '@/store/app'
  import { EditorConfigMake } from '@/util/Editor'

  const { shell } = require('@electron/remote')
  const { join } = require('path')
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{
    item: any
  }>()
  const config = ref('')
  const configpath = ref('')
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const openConfig = () => {
    shell.showItemInFolder(configpath.value)
  }

  const saveConfig = () => {
    const content = monacoInstance?.getValue() ?? ''
    writeFileAsync(configpath.value, content).then(() => {
      Base.MessageSuccess(I18nT('base.success'))
    })
  }

  const getConfig = () => {
    readFileAsync(configpath.value).then((conf) => {
      config.value = conf
      initEditor()
    })
  }
  const initEditor = () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = editor.create(input.value, EditorConfigMake(config.value, false, 'off'))
      monacoInstance.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          saveConfig()
        }
      })
    } else {
      monacoInstance.setValue(config.value)
    }
  }

  const baseDir = global.Server.BaseDir
  configpath.value = join(baseDir, 'vhost', props.item.flag, `${props.item.item.name}.conf`)
  getConfig()

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
