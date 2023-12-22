<template>
  <div class="apache-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button class="shrink0" @click="logDo">{{ $t('base.open') }}</el-button>
      <el-button class="shrink0" @click="logDo">{{ $t('base.refresh') }}</el-button>
      <el-button class="shrink0" @click="logDo">{{ $t('base.clean') }}</el-button>
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

<style lang="scss">
  .apache-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px 0 0 20px;
    .block {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea {
        height: 100%;
      }
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
      .shrink0 {
        flex-shrink: 0;
      }
      .path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-right: 20px;
      }
    }
  }
</style>
