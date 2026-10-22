<template>
  <div class="main-wapper">
    <div ref="input" class="block"></div>
  </div>
  <div class="tool gap-3">
    <el-button-group>
      <el-tooltip :show-after="600" :content="I18nT('conf.open')" placement="top">
        <el-button :disabled="disabled" @click="files.open(id)">
          <FolderOpened class="w-5 h-5 p-0.5" />
        </el-button>
      </el-tooltip>
      <el-tooltip :show-after="600" :content="I18nT('conf.save')" placement="top">
        <el-button :disabled="disabled" @click="save">
          <el-badge is-dot :offset="[8, 1]" :hidden="!changed">
            <yb-icon :svg="import('@/svg/save.svg?raw')" class="w-5 h-5 p-0.5" />
          </el-badge>
        </el-button>
      </el-tooltip>
      <el-tooltip :show-after="600" :content="I18nT('conf.loadDefault')" placement="top">
        <el-button :disabled="disabled || !state.defaultFile" @click="files.loadDefault(id)">
          <yb-icon :svg="import('@/svg/load-default.svg?raw')" class="w-5 h-5" />
        </el-button>
      </el-tooltip>
    </el-button-group>
    <el-button-group>
      <el-tooltip :show-after="600" :content="I18nT('conf.loadCustom')" placement="top">
        <el-button :disabled="disabled" @click="files.loadCustom(id)">
          <yb-icon :svg="import('@/svg/custom.svg?raw')" class="w-5 h-5 p-0.5" />
        </el-button>
      </el-tooltip>
      <el-tooltip :show-after="600" :content="I18nT('conf.saveCustom')" placement="top">
        <el-button :disabled="disabled" @click="files.saveCustom(id, draft)">
          <yb-icon :svg="import('@/svg/saveas.svg?raw')" class="w-5 h-5 p-0.5" />
        </el-button>
      </el-tooltip>
    </el-button-group>
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { I18nT } from '@lang/index'
  import { MariadbClusterManager as manager } from '../manager'
  import { InstanceFiles as files } from './manager'

  const props = defineProps<{ id: string }>()
  const state = computed(() => files.state(props.id, 'config'))
  const disabled = computed(
    () => state.value.busy || !state.value.loaded || !!manager.operations[props.id]?.busy
  )
  const input = ref<HTMLElement>()
  const draft = ref(state.value.text)
  const changed = computed(() => draft.value !== state.value.saved)
  let instance: editor.IStandaloneCodeEditor | undefined
  let disposed = false
  const save = () => files.save(props.id, draft.value)

  watch(
    () => state.value.revision,
    () => {
      draft.value = state.value.text
      instance?.setValue(state.value.text)
    }
  )
  watch(disabled, (readOnly) => instance?.updateOptions({ readOnly }))
  onMounted(async () => {
    void files.load(props.id, 'config')
    const config = await EditorConfigMake(draft.value, disabled.value, 'off', 'ini')
    if (disposed || !input.value) return
    instance = EditorCreate(input.value, {
      ...config,
      value: draft.value,
      readOnly: disabled.value
    })
    instance?.onDidChangeModelContent(() => {
      draft.value = instance?.getValue() ?? ''
    })
    instance?.addAction({
      id: 'save',
      label: 'save',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: () => {
        void save()
      }
    })
  })
  onUnmounted(() => {
    disposed = true
    const model = instance?.getModel()
    instance?.dispose()
    model?.dispose()
    instance = undefined
  })
</script>
