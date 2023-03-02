<template>
  <div class="mongodb-config">
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
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, defineComponent } from 'vue'
  import { AppStore } from '@/store/app'

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
        typeFlag: 'mongodb'
      }
    },
    computed: {
      currentVersion() {
        return AppStore().config?.server?.mongodb?.current?.version
      }
    },
    watch: {},
    created: function () {},
    mounted() {
      if (!this.currentVersion) {
        this.config = this.$t('base.needSelectVersion')
        this.$message.error(this.config)
      } else {
        const v = this.currentVersion.split('.').slice(0, 2).join('.')
        this.configPath = join(global.Server.MongoDBDir, `mongodb-${v}.conf`)
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
              this.$message.error(this.$t('base.fileBigErr'))
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
            defaultPath: 'mongodb-custom.conf',
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
              this.$message.success(this.$t('base.success'))
            })
          })
      },
      openConfig() {
        shell.showItemInFolder(this.configPath)
      },
      saveConfig() {
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configPath, content).then(() => {
          this.$message.success(this.$t('base.success'))
        })
      },
      getConfig() {
        if (!existsSync(this.configPath)) {
          this.config = this.$t('base.needSelectVersion')
          const appStore = AppStore()
          appStore.config.server.mongodb.current = {}
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
        const tmpl = join(global.Server.Static, 'tmpl/mongodb.conf')
        const dataDir = join(global.Server.MongoDBDir, `data-${v}`)
        readFileAsync(tmpl).then((conf) => {
          this.config = conf.replace('##DB-PATH##', dataDir)
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
            readOnly: !this.currentVersion,
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
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

<style lang="scss">
  .mongodb-config {
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
