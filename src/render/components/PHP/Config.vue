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
          <span class="ml-15">php.ini</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button :disabled="!configpath" @click="openConfig">{{ $t('base.open') }}</el-button>
          <el-button :disabled="!configpath" @click="saveConfig">{{ $t('base.save') }}</el-button>
          <el-button :disabled="!configpath" @click="getDefault">{{
            $t('base.loadDefault')
          }}</el-button>
          <el-button-group style="margin-left: 12px">
            <el-button :disabled="!configpath" @click="loadCustom">{{
              $t('base.loadCustom')
            }}</el-button>
            <el-button :disabled="!configpath" @click="saveCustom">{{
              $t('base.saveCustom')
            }}</el-button>
          </el-button-group>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts">
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { reloadService } from '@/util/Service'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import IPC from '@/util/IPC'
  import { nextTick, defineComponent } from 'vue'
  import { VueExtend } from '@/core/VueExtend'
  import type { SoftInstalled } from '@/store/brew'

  const { existsSync } = require('fs')
  const { shell } = require('@electron/remote')
  const { dialog } = require('@electron/remote')
  const IniFiles: { [key: string]: any } = {}

  export default defineComponent({
    show(data: any) {
      return new Promise(() => {
        let dom: HTMLElement | null = document.createElement('div')
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
      loadCustom() {
        let opt = ['openFile', 'showHiddenFiles']
        dialog
          .showOpenDialog({
            properties: opt
          })
          .then(({ canceled, filePaths }: any) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const file = filePaths[0]
            readFileAsync(file).then((conf) => {
              this.config = conf
              this.initEditor()
            })
          })
      },
      saveCustom() {
        let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
        dialog
          .showSaveDialog({
            properties: opt,
            defaultPath: 'php-custom.ini',
            filters: [
              {
                extensions: ['ini']
              }
            ]
          })
          .then(({ canceled, filePath }: any) => {
            if (canceled || !filePath) {
              return
            }
            const content = this.monacoInstance.getValue()
            writeFileAsync(filePath, content).then(() => {
              this.$message.success(this.$t('base.success'))
            })
          })
      },
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
          this.$message.success(this.$t('base.success'))
          if (this.phpRunning) {
            reloadService('php', this.version as SoftInstalled)
          }
        })
      },
      getConfig() {
        if (!this.versionDir) {
          this.config = this.$t('base.selectPhpVersion')
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
          IPC.send('app-fork:php', 'getIniPath', this.versionDir).then((key: string, res: any) => {
            console.log(res)
            IPC.off(key)
            if (res.code === 0) {
              IniFiles[this.versionDir] = res.iniPath
              readConfig()
            } else {
              const err = this.$t('php.phpiniNoFound')
              this.$message.error(err)
              this.config = err
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
          this.$message.error(this.$t('base.defaultConFileNoFound'))
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
