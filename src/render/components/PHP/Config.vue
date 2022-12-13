<template>
  <div class="php-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!configpath" @click="openConfig">打开</el-button>
      <el-button :disabled="!configpath" @click="saveConfig">保存</el-button>
      <el-button :disabled="!configpath" @click="getDefault">加载默认</el-button>
    </div>
  </div>
</template>

<script>
  import { readFileAsync, writeFileAsync } from '@shared/file.js'
  import { mapGetters } from 'vuex'
  import { reloadService } from '@/util/Service.js'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import IPC from '@/util/IPC.js'
  import { nextTick } from 'vue'

  const { existsSync } = require('fs')
  const { shell } = require('@electron/remote')

  const IniFiles = {}

  export default {
    name: 'MoPhpConfig',
    components: {},
    props: {},
    data() {
      return {
        config: '',
        configpath: ''
      }
    },
    computed: {
      ...mapGetters('app', {
        server: 'server',
        stat: 'stat'
      }),
      phpRunning() {
        return this?.stat?.php ?? false
      },
      version() {
        return this.server?.php?.current ?? {}
      },
      versionDir() {
        return this.server?.php?.current?.path ?? ''
      }
    },
    watch: {
      versionDir: {
        handler(val) {
          if (val) {
            this.getConfig()
          }
        },
        immediate: true
      }
    },
    created: function () {},
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
        if (this.configpath) {
          shell.showItemInFolder(this.configpath)
        }
      },
      saveConfig() {
        if (!this.configpath) {
          return
        }
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configpath, content).then(() => {
          this.$message.success('配置文件保存成功')
          if (this.phpRunning) {
            reloadService('php', this.version)
          }
        })
      },
      getConfig() {
        if (!this.versionDir) {
          this.config = '请先选择PHP版本'
          return
        }
        const readConfig = () => {
          this.configpath = IniFiles[this.versionDir]
          readFileAsync(this.configpath).then((conf) => {
            this.config = conf
            this.initEditor()
          })
        }
        if (!IniFiles[this.versionDir]) {
          IPC.send('app-fork:php', 'getIniPath', this.versionDir).then((key, res) => {
            console.log(res)
            IPC.off(key)
            if (res.code === 0) {
              IniFiles[this.versionDir] = res.iniPath
              readConfig()
            } else {
              this.$message.error('php.ini文件获取失败')
              this.config = 'php.ini文件获取失败'
            }
          })
        } else {
          readConfig()
        }
      },
      getDefault() {
        if (!this.configpath) {
          return
        }
        let configpath = `${this.configpath}.default`
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
  .php-config {
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
