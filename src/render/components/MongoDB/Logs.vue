<template>
  <div class="module-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="!filepath" @click="logDo('open')">{{ $t('base.open') }}</el-button>
      <el-button :disabled="!filepath" @click="logDo('refresh')">{{
        $t('base.refresh')
      }}</el-button>
      <el-button :disabled="!filepath" @click="logDo('clean')">{{ $t('base.clean') }}</el-button>
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
  import { EditorConfigMake } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { existsSync } = require('fs')
  const { exec } = require('child-process-promise')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default defineComponent({
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
      },
      currentVersion() {
        return AppStore().config?.server?.mongodb?.current?.version
      }
    },
    watch: {
      currentVersion() {
        this.init()
      },
      log() {
        nextTick().then(() => {
          this.initEditor()
        })
      }
    },
    created() {
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
          this.monacoInstance = editor.create(input, EditorConfigMake(this.log, true, 'on'))
        } else {
          this.monacoInstance.setValue(this.log)
        }
      },
      logDo(flag: string) {
        if (!existsSync(this.filepath)) {
          MessageError(this.$t('base.noFoundLogFile'))
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
                MessageSuccess(this.$t('base.success'))
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
          this.log = this.$t('base.needSelectVersion')
        }
      },
      init() {
        const v = this?.currentVersion?.split('.')?.slice(0, 2)?.join('.')
        if (v) {
          this.filepath = join(global.Server.MongoDBDir, `mongodb-${v}.log`)
        } else {
          this.filepath = ''
        }
        this.getLog()
      }
    }
  })
</script>
