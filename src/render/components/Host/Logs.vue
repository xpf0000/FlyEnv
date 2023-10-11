<template>
  <div class="host-logs">
    <ul class="top-tab">
      <li :class="type === 'nginx-access' ? 'active' : ''" @click="initType('nginx-access')"
        >Nginx-Access</li
      >
      <li :class="type === 'nginx-error' ? 'active' : ''" @click="initType('nginx-error')"
        >Nginx-Error</li
      >
      <li :class="type === 'apache-access' ? 'active' : ''" @click="initType('apache-access')"
        >Apache-Access</li
      >
      <li :class="type === 'apache-error' ? 'active' : ''" @click="initType('apache-error')"
        >Apache-Error</li
      >
    </ul>
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

  const { existsSync, watch } = require('fs')
  const { exec } = require('child-process-promise')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoHostLogs',
    components: {},
    props: {},
    data() {
      return {
        type: '',
        name: '',
        filepath: '',
        log: '',
        logfile: {}
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
    created: function () {},
    mounted() {
      nextTick().then(() => {
        this.initEditor()
      })
    },
    unmounted() {
      this.monacoInstance && this.monacoInstance.dispose()
      this.monacoInstance = null
      if (this.watcher) {
        this.watcher.close()
        this.watcher = null
      }
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
          const watchLog = () => {
            if (!this.watcher) {
              this.watcher = watch(this.filepath, () => {
                read()
              })
            }
          }
          const read = () => {
            readFileAsync(this.filepath).then((log) => {
              this.log = log
            })
          }
          read()
          watchLog()
        } else {
          this.log = this.$t('base.noLogs')
        }
      },
      initType(type: string) {
        this.type = type
        const logFile: { [key: string]: string } = this.logfile
        this.filepath = logFile[type]
        this.getLog()
      },
      init() {
        let logpath = join(global.Server.BaseDir, 'vhost/logs')
        let accesslogng = join(logpath, `${this.name}.log`)
        let errorlogng = join(logpath, `${this.name}.error.log`)
        let accesslogap = join(logpath, `${this.name}-access_log`)
        let errorlogap = join(logpath, `${this.name}-error_log`)
        this.logfile = {
          'nginx-access': accesslogng,
          'nginx-error': errorlogng,
          'apache-access': accesslogap,
          'apache-error': errorlogap
        }
      }
    }
  })
</script>

<style lang="scss">
  .host-logs {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 20px 20px 0 20px;
    background: #1d2033;
    .block {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea {
        height: 100%;
      }
    }
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        cursor: pointer;
        padding: 0 20px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
      }
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0;
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
