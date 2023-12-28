<template>
  <div class="module-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!version" @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button :disabled="!version" @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button :disabled="!version" @click="getDefault">{{ $t('base.loadDefault') }}</el-button>
      <el-button-group style="margin-left: 12px">
        <el-button :disabled="!version" @click="loadCustom">{{ $t('base.loadCustom') }}</el-button>
        <el-button :disabled="!version" @click="saveCustom">{{ $t('base.saveCustom') }}</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick } from 'vue'
  import { AppStore } from '@/store/app'
  import IPC from '@/util/IPC'
  import { EditorConfigMake } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { dialog } = require('@electron/remote')
  const { existsSync, statSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoRedisConfig',
    components: {},
    props: {},
    data() {
      return {
        config: '',
        realDir: '',
        typeFlag: 'redis'
      }
    },
    computed: {
      version() {
        return AppStore().config?.server?.redis?.current?.version
      },
      vNum() {
        const version = this?.version ?? ''
        return version.split('.')?.[0]
      },
      configPath() {
        if (this.vNum) {
          return join(global.Server.RedisDir, `redis-${this.vNum}.conf`)
        }
        return undefined
      }
    },
    watch: {
      configPath: {
        handler(v) {
          if (v) {
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
        const defaultPath = this.vNum ? `redis-${this.vNum}-custom.conf` : 'redis-custom.conf'
        dialog
          .showSaveDialog({
            properties: opt,
            defaultPath: defaultPath,
            filters: [
              {
                extensions: ['conf']
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
      openConfig() {
        shell.showItemInFolder(this.configPath)
      },
      saveConfig() {
        if (!this.version) {
          return
        }
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configPath, content).then(() => {
          MessageSuccess(this.$t('base.success'))
        })
      },
      getConfig() {
        const doRead = () => {
          readFileAsync(this.configPath).then((conf) => {
            this.config = conf
            this.initEditor()
          })
        }
        if (!existsSync(this.configPath)) {
          IPC.send('app-fork:redis', 'initConf', {
            version: this.version
          }).then((key: string) => {
            IPC.off(key)
            doRead()
          })
          return
        }
        doRead()
      },
      getDefault() {
        if (!this.vNum) {
          MessageError(this.$t('base.defaultConFileNoFound'))
          return
        }
        let configPath = join(global.Server.RedisDir, `redis-${this.vNum}-default.conf`)
        if (!existsSync(configPath)) {
          MessageError(this.$t('base.defaultConFileNoFound'))
          return
        }
        readFileAsync(configPath).then((conf) => {
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
          this.monacoInstance = editor.create(input, EditorConfigMake(this.config, false, 'off'))
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
