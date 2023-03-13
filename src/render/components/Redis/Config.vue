<template>
  <div class="redis-config">
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
        configPath: '',
        typeFlag: 'redis'
      }
    },
    computed: {
      version() {
        return AppStore().config?.server?.redis?.current?.version
      }
    },
    watch: {},
    created: function () {
      this.configPath = join(global.Server.RedisDir, 'common/redis.conf')
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
            defaultPath: 'redis-custom.conf',
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
        if (!this.version) {
          return
        }
        const content = this.monacoInstance.getValue()
        writeFileAsync(this.configPath, content).then(() => {
          this.$message.success(this.$t('base.success'))
        })
      },
      getConfig() {
        console.log('this.configPath: ', this.configPath)
        readFileAsync(this.configPath).then((conf) => {
          this.config = conf
          this.initEditor()
        })
      },
      getDefault() {
        let configPath = join(global.Server.RedisDir, 'common/redis.conf.default')
        if (!existsSync(configPath)) {
          this.$message.error(this.$t('base.defaultConFileNoFound'))
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
          this.monacoInstance = editor.create(input, {
            value: this.config,
            language: 'ini',
            theme: 'vs-dark',
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true
          })
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

<style lang="scss">
  .redis-config {
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
