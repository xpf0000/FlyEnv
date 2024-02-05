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
      </div>

      <div class="tool">
        <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
        <el-button @click="saveConfig">{{ $t('base.save') }}</el-button>
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
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake } from '@/util/Editor'
  import { MessageSuccess } from '@/util/Element'

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
      MessageSuccess(I18nT('base.success'))
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
