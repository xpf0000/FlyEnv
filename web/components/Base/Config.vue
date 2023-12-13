<template>
  <div class="apache-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button @click="getDefault">{{ $t('base.loadDefault') }}</el-button>
      <el-button-group style="margin-left: 12px">
        <el-button @click="loadCustom">{{ $t('base.loadCustom') }}</el-button>
        <el-button @click="saveCustom">{{ $t('base.saveCustom') }}</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script lang="ts">
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { defineComponent } from 'vue'

  export default defineComponent({
    name: 'MoApacheConfig',
    components: {},
    props: {
      config: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        typeFlag: 'apache',
        configpath: ''
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    mounted() {
      this.initEditor()
    },
    unmounted() {
      this.monacoInstance && this.monacoInstance.dispose()
      this.monacoInstance = null
    },
    methods: {
      loadCustom() {},
      saveCustom() {},
      openConfig() {},
      saveConfig() {},
      getConfig() {},
      getDefault() {
        this.initEditor()
      },
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          this.monacoInstance = editor.create(input, {
            value: this.config,
            language: 'ini',
            theme: 'vs-dark',
            readOnly: false,
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
          })
          this.monacoInstance.addAction({
            id: 'save',
            label: 'save',
            keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
            run: () => {
              this.saveConfig()
            }
          })
        } else {
          this.monacoInstance.setValue(this.config)
          this.monacoInstance.updateOptions({
            readOnly: false
          })
        }
      }
    }
  })
</script>

<style lang="scss">
  .apache-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 10px 0 0 20px;
    .block {
      width: 100%;
      flex: 1;
      overflow: hidden;
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
    }
  }
</style>
