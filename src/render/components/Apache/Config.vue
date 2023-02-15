<template>
  <div class="apache-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button :disabled="!version" @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button :disabled="!version" @click="getDefault">{{ $t('base.loadDefault') }}</el-button>
    </div>
  </div>
</template>

<script lang="ts">
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, defineComponent } from 'vue'
  import { md5 } from '@/util/Index'
  import { AppStore } from '@/store/app'

  const { shell } = require('@electron/remote')
  const { join } = require('path')
  const { existsSync } = require('fs')

  export default defineComponent({
    name: 'MoApacheConfig',
    components: {},
    props: {},
    data() {
      return {
        config: '',
        typeFlag: 'apache',
        configpath: ''
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.apache?.current
      }
    },
    watch: {},
    created: function () {
      this.getConfig()
    },
    mounted() {
      nextTick().then(() => {
        this.initEditor()
      })
    },
    unmounted() {
      this.monacoInstance && this.monacoInstance.dispose()
      this.monacoInstance = null
    },
    methods: {
      openConfig() {
        shell.showItemInFolder(this.configpath)
      },
      saveConfig() {
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configpath, content).then(() => {
          this.$message.success('配置文件保存成功!')
        })
      },
      getConfig() {
        if (!this?.version?.version) {
          this.config = '请先选择版本'
          this.$message.error(this.config)
          this.initEditor()
          return
        }
        const name = md5(this.version.bin!)
        this.configpath = join(global.Server.ApacheDir, `common/conf/${name}.conf`)
        if (!existsSync(this.configpath)) {
          this.config = '未找到配置文件, 请重新选择版本'
          this.$message.error(this.config)
          this.initEditor()
          return
        }
        readFileAsync(this.configpath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        if (!this?.version?.version) {
          this.$message.error('请先选择版本')
          return
        }
        const name = md5(this.version.bin!)
        const configpath = join(global.Server.ApacheDir, `common/conf/${name}.default.conf`)
        if (!existsSync(configpath)) {
          this.$message.error('未找到默认配置文件')
          return
        }
        readFileAsync(configpath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
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
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
          })
        } else {
          this.monacoInstance.setValue(this.config)
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
    padding: 20px 0 0 20px;
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
      padding: 30px 0;
    }
  }
</style>
