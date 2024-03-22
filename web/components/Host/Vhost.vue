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
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
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
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { AsyncComponentSetup, EditorConfigMake, EditorCreate } from '@web/fn'
  import VhostApache from '../../config/vhost.apache.txt?raw'
  import VhostNginx from '../../config/vhost.nginx.txt?raw'
  import VhostCaddy from '../../config/vhost.caddy.txt?raw'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{
    item: any
  }>()
  const config = ref('')
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const openConfig = () => {}

  const saveConfig = () => {}

  const getConfig = () => {
    if (props.item.flag === 'nginx') {
      config.value = VhostNginx
    } else if (props.item.flag === 'apache') {
      config.value = VhostApache
    } else {
      config.value = VhostCaddy
    }
    initEditor()
  }

  const initEditor = () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = EditorCreate(input.value, EditorConfigMake(config.value, false, 'off'))
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
