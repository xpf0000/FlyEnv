<template>
  <div class="module-config">
    <el-card>
      <div ref="input" class="block"></div>
      <template #footer>
        <div class="tool">
          <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
          <el-button @click="saveConfig">{{ $t('base.save') }}</el-button>
          <el-button @click="getDefault">{{ $t('base.loadDefault') }}</el-button>
          <el-button-group style="margin-left: 12px">
            <el-button @click="loadCustom">{{ $t('base.loadCustom') }}</el-button>
            <el-button @click="saveCustom">{{ $t('base.saveCustom') }}</el-button>
          </el-button-group>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts">
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { KeyMod, KeyCode } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { nextTick, defineComponent } from 'vue'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  const { dialog } = require('@electron/remote')
  const { existsSync, statSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        config: '',
        configpath: ''
      }
    },
    computed: {
      currentVersion() {
        const appStore = AppStore()
        const brewStore = BrewStore()
        const current = appStore.config.server?.rabbitmq?.current
        const installed = brewStore.module('rabbitmq').installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      }
    },
    watch: {},
    created: function () {},
    mounted() {
      this.getConfig()
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
            defaultPath: 'rabbitmq-custom.conf',
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
        shell.showItemInFolder(this.configpath)
      },
      saveConfig() {
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configpath, content).then(() => {
          MessageSuccess(this.$t('base.success'))
        })
      },
      getConfig() {
        if (!this.currentVersion) {
          return
        }
        IPC.send(
          'app-fork:rabbitmq',
          'initConfig',
          JSON.parse(JSON.stringify(this.currentVersion))
        ).then((key: string, res: any) => {
          IPC.off(key)
          if (res?.data) {
            this.configpath = res.data
            readFileAsync(this.configpath).then((conf) => {
              this.config = conf
              this.initEditor()
            })
          }
        })
      },
      getDefault() {
        const v = this.currentVersion?.version?.split('.')?.[0] ?? ''
        const configpath = join(global.Server.BaseDir, 'rabbitmq', `rabbitmq-${v}-default.conf`)
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
