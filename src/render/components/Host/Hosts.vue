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
          <span class="ml-3">{{ I18nT('base.hostsTitle') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>

      <div class="tool">
        <el-button @click="openConfig">{{ I18nT('base.open') }}</el-button>
        <el-button @click="saveConfig">{{ I18nT('base.save') }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { shell, fs } from '@/util/NodeFn.js'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  const config = ref('')
  const configpath = '/private/etc/hosts'
  const input = ref<HTMLElement | null>(null)
  const monacoInstance = ref<any>(null)

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const getConfig = async () => {
    try {
      const conf = await fs.readFile(configpath)
      config.value = conf
      initEditor()
    } catch {
      config.value = I18nT('base.hostsReadFailed')
      initEditor()
    }
  }

  const initEditor = () => {
    if (!monacoInstance.value) {
      if (!input.value?.style) {
        return
      }
      monacoInstance.value = EditorCreate(input.value, EditorConfigMake(config.value, false, 'off'))
      monacoInstance.value.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          saveConfig()
        }
      })
    } else {
      monacoInstance.value.setValue(config.value)
    }
  }

  const openConfig = () => {
    shell.showItemInFolder(configpath)
  }

  const saveConfig = async () => {
    try {
      const content = monacoInstance.value.getValue()
      await fs.writeFile(configpath, content)
      MessageSuccess(I18nT('base.success'))
    } catch {
      MessageError(I18nT('base.hostsSaveFailed'))
    }
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance.value?.dispose()
    monacoInstance.value = null
  })

  // Initialize config
  getConfig()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
