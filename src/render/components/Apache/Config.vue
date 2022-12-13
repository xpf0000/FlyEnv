<template>
  <div class="apache-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button @click="openConfig">打开</el-button>
      <el-button :disabled="!version" @click="saveConfig">保存</el-button>
      <el-button :disabled="!version" @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { writeFileAsync, readFileAsync } from '@shared/file.js'
  import { AppMixins } from '@/mixins/AppMixins.js'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick } from 'vue'

  const { shell } = require('@electron/remote')
  const { join } = require('path')
  const { existsSync } = require('fs')

  export default {
    name: 'MoApacheConfig',
    components: {},
    mixins: [AppMixins],
    props: {},
    data() {
      return {
        config: '',
        typeFlag: 'apache'
      }
    },
    watch: {},
    created: function () {
      this.configpath = join(global.Server.ApacheDir, 'common/conf/httpd.conf')
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
        readFileAsync(this.configpath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        let configpath = join(global.Server.ApacheDir, 'common/conf/httpd.conf.default')
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
          if (!this?.$refs?.input?.style) {
            return
          }
          this.monacoInstance = editor.create(this.$refs.input, {
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
  }
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
