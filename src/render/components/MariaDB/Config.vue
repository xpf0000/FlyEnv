<template>
  <div class="module-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!currentVersion" @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button :disabled="!currentVersion" @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button :disabled="!currentVersion" @click="getDefault">{{
        $t('base.loadDefault')
      }}</el-button>
      <el-button-group style="margin-left: 12px">
        <el-button :disabled="!currentVersion" @click="loadCustom">{{
          $t('base.loadCustom')
        }}</el-button>
        <el-button :disabled="!currentVersion" @click="saveCustom">{{
          $t('base.saveCustom')
        }}</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script lang="ts">
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { nextTick, defineComponent } from 'vue'
  import { AppStore } from '@/store/app'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'

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
        realDir: '',
        configPath: '',
        typeFlag: 'mariadb'
      }
    },
    computed: {
      currentVersion() {
        return AppStore().config?.server?.mariadb?.current?.version
      }
    },
    watch: {},
    created: function () {},
    mounted() {
      if (!this.currentVersion) {
        this.config = this.$t('base.needSelectVersion')
        MessageError(this.config)
      } else {
        const v = this.currentVersion.split('.').slice(0, 2).join('.')
        this.configPath = join(global.Server.MariaDBDir, `my-${v}.cnf`)
        this.getConfig()
      }
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
            defaultPath: 'mariadb-custom.cnf',
            filters: [
              {
                extensions: ['cnf']
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
        if (!this.currentVersion) {
          return
        }
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configPath, content).then(() => {
          MessageSuccess(this.$t('base.success'))
        })
      },
      getConfig() {
        if (!existsSync(this.configPath)) {
          this.config = this.$t('base.needSelectVersion')
          const appStore = AppStore()
          appStore.config.server.mariadb.current = {}
          appStore.saveConfig()
          return
        }
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        const v = this?.currentVersion?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const dataDir = join(global.Server.MariaDBDir, `data-${v}`)
        this.config = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3307
datadir=${dataDir}`
        this.initEditor()
      },
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          this.monacoInstance = EditorCreate(
            input,
            EditorConfigMake(this.config, !this.currentVersion, 'off')
          )
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
            readOnly: !this.currentVersion
          })
        }
      }
    }
  })
</script>
