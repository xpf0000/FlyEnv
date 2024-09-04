<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="onDrawerClosed"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ version.version }} - {{ version.path }} - php.ini</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>

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
  </el-drawer>
</template>

<script lang="ts">
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { reloadService } from '@/util/Service'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import IPC from '@/util/IPC'
  import { nextTick, defineComponent } from 'vue'
  import { VueExtend } from '@/core/VueExtend'
  import type { SoftInstalled } from '@/store/brew'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { execPromiseRoot } from '@shared/Exec'

  const { existsSync, statSync, unlink } = require('fs')
  const { join } = require('path')
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
            const state = statSync(file)
            if (state.size > 5 * 1024 * 1024) {
              MessageError(this.$t('base.fileBigErr'))
              return
            }
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
              MessageSuccess(this.$t('base.success'))
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
        const tmplFile = join(global.Server.Cache, 'php.ini.edit')
        writeFileAsync(tmplFile, content).then(async () => {
          try {
            await execPromiseRoot(['cp', tmplFile, this.configpath])
          } catch (e) {}
          unlink(tmplFile, () => {})
          MessageSuccess(this.$t('base.success'))
          if (this.phpRunning) {
            reloadService('php', this.version as SoftInstalled).then()
          }
        })
      },
      getConfig() {
        if (!this.versionDir) {
          this.config = this.$t('base.selectPhpVersion')
          return
        }
        const readConfig = () => {
          const flag = this.version?.phpBin ?? this.versionDir
          this.configpath = IniFiles[flag]
          readFileAsync(this.configpath).then((conf) => {
            this.config = conf
            this.initEditor()
          })
        }
        const flag = this.version?.phpBin ?? this.versionDir
        if (!IniFiles[flag]) {
          IPC.send('app-fork:php', 'getIniPath', JSON.parse(JSON.stringify(this.version))).then(
            (key: string, res: any) => {
              console.log(res)
              IPC.off(key)
              if (res.code === 0) {
                IniFiles[flag] = res.data
                readConfig()
              } else {
                const err = this.$t('php.phpiniNoFound')
                MessageError(err)
                this.config = err
              }
            }
          )
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
          MessageError(this.$t('base.defaultConFileNoFound'))
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
          this.monacoInstance = EditorCreate(input, EditorConfigMake(this.config, false, 'off'))
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
        }
      }
    }
  })
</script>
