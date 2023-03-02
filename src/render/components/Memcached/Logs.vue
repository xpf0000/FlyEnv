<template>
  <div class="memcached-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('open')">{{
        $t('base.open')
      }}</el-button>
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('refresh')">{{
        $t('base.refresh')
      }}</el-button>
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('clean')">{{
        $t('base.clean')
      }}</el-button>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, nextTick } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'

  const { existsSync } = require('fs')
  const { exec } = require('child-process-promise')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoMemcachedLogs',
    components: {},
    props: {},
    data() {
      return {
        filepath: '',
        log: ''
      }
    },
    computed: {
      password() {
        return AppStore().config.password
      }
    },
    watch: {
      log() {
        nextTick().then(() => {
          this.initEditor()
        })
      }
    },
    created: function () {
      this.init()
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
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          this.monacoInstance = editor.create(input, {
            value: this.log,
            language: 'ini',
            theme: 'vs-dark',
            readOnly: true,
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true,
            wordWrap: 'on'
          })
        } else {
          this.monacoInstance.setValue(this.log)
        }
      },
      logDo(flag: string) {
        if (!existsSync(this.filepath)) {
          this.$message.error(this.$t('base.noFoundLogFile'))
          return
        }
        switch (flag) {
          case 'open':
            shell.showItemInFolder(this.filepath)
            break
          case 'refresh':
            this.getLog()
            break
          case 'clean':
            writeFileAsync(this.filepath, '')
              .then(() => {
                this.log = ''
                this.$message.success(this.$t('base.success'))
              })
              .catch(() => {
                if (!this.password) {
                  EventBus.emit('vue:need-password')
                } else {
                  exec(`echo '${this.password}' | sudo -S chmod 777 ${this.filepath}`)
                    .then(() => {
                      this.logDo('clean')
                    })
                    .catch(() => {
                      EventBus.emit('vue:need-password')
                    })
                }
              })
            break
        }
      },
      getLog() {
        if (existsSync(this.filepath)) {
          readFileAsync(this.filepath).then((log) => {
            this.log = log
          })
        } else {
          this.log = this.$t('base.noLogs')
        }
      },
      init() {
        this.filepath = join(global.Server.MemcachedDir, 'logs/memcached.log')
        this.getLog()
      }
    }
  })
</script>

<style lang="scss">
  .memcached-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px 0 0 20px;
    .block {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea {
        height: 100%;
      }
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
      .shrink0 {
        flex-shrink: 0;
      }
      .path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-right: 20px;
      }
    }
  }
</style>
