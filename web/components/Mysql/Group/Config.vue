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
          <span class="ml-15">{{ $t('base.configFile') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
      <div class="tool">
        <el-button :disabled="disabled" @click="openConfig">{{ $t('base.open') }}</el-button>
        <el-button :disabled="disabled" @click="saveConfig">{{ $t('base.save') }}</el-button>
        <el-button-group style="margin-left: 12px">
          <el-button :disabled="disabled" @click="loadCustom">{{
            $t('base.loadCustom')
          }}</el-button>
          <el-button :disabled="disabled" @click="saveCustom">{{
            $t('base.saveCustom')
          }}</el-button>
        </el-button-group>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { EditorConfigMake } from '@web/fn'
  import type { MysqlGroupItem } from '@shared/app'
  import { AsyncComponentSetup } from '@web/fn'
  import { MessageSuccess } from '@/util/Element'
  import { I18nT } from '@shared/lang'

  defineProps<{
    item: MysqlGroupItem
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const saveCustom = () => {
    MessageSuccess(I18nT('base.success'))
  }

  const saveConfig = () => {
    MessageSuccess(I18nT('base.success'))
  }

  const initEditor = () => {
    if (!monacoInstance) {
      const dom: HTMLElement = input?.value as any
      if (!dom || !dom?.style) {
        return
      }
      monacoInstance = editor.create(dom, EditorConfigMake(config.value, false, 'off'))
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

  const loadCustom = () => {}

  const openConfig = () => {}

  const getConfig = () => {
    const doRead = () => {
      config.value = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION`
      initEditor()
      disabled.value = false
    }
    doRead()
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
