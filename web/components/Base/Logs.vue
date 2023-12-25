<template>
  <div class="module-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button @click="logDo">{{ $t('base.open') }}</el-button>
      <el-button @click="logDo">{{ $t('base.refresh') }}</el-button>
      <el-button @click="logDo">{{ $t('base.clean') }}</el-button>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { EditorConfigMake } from '../../fn'

  export default defineComponent({
    mounted() {
      this.initEditor()
    },
    unmounted() {
      this.monacoInstance && this.monacoInstance.dispose()
      this.monacoInstance = null
    },
    methods: {
      initEditor() {
        this.monacoInstance = editor.create(
          this?.$refs?.input as HTMLElement,
          EditorConfigMake('', true, 'on')
        )
      },
      logDo() {}
    }
  })
</script>
