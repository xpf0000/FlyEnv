<template>
  <el-drawer
    v-model="show"
    size="65%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="onDrawerClosed"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
          <span class="ml-15">配置文件</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button :disabled="!configpath" @click="openConfig">打开</el-button>
          <el-button :disabled="!configpath" @click="saveConfig">保存</el-button>
          <el-button :disabled="!configpath" @click="getDefault">加载默认</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
  import { readFileAsync, writeFileAsync } from '@shared/file.js'
  import { reloadService } from '@/util/Service.js'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import IPC from '@/util/IPC.js'
  import { nextTick } from 'vue'
  import { VueExtend } from '@/core/VueExtend.js'

  const { existsSync } = require('fs')
  const { shell } = require('@electron/remote')

  const IniFiles = {}

  export default {
    show(data) {
      return new Promise(() => {
        let dom = document.createElement('div')
        document.body.appendChild(dom)
        let vm = VueExtend(this, data)
        const intance = vm.mount(dom)
        intance.onClosed = () => {
          dom && dom.remove()
          dom = null
          console.log('intance.onClosed !!!!!!')
        }
      })
    },
    components: {},
    props: {
      version: {
        type: Object,
        default() {
          return {}
        }
      }
    },
    data() {
      return {
        show: true,
        config: '',
        configpath: ''
      }
    },
    computed: {
      phpRunning() {
        return this?.version?.run
      },
      versionDir() {
        return this.version?.path ?? ''
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
      close() {
        this.show = false
        this.$destroy()
        this.onClosed()
      },
      onDrawerClosed() {
        this.onClosed()
      },
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
  .host-vhost {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: hidden;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      flex-direction: column;

      > .block {
        width: 100%;
        flex: 1;
        overflow: hidden;
      }
      .tool {
        flex-shrink: 0;
        padding: 30px 0 20px 0;
      }
    }
  }
</style>
