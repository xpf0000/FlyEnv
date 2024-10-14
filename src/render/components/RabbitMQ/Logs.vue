<template>
  <div class="module-config">
    <el-card>
      <div ref="input" class="block"></div>
      <template #footer>
        <div class="tool">
          <el-button :disabled="!filepath" @click="logDo('open')">{{ $t('base.open') }}</el-button>
          <el-button :disabled="!filepath" @click="logDo('refresh')">{{
            $t('base.refresh')
          }}</el-button>
          <el-button :disabled="!filepath" @click="logDo('clean')">{{
            $t('base.clean')
          }}</el-button>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts">
  import { defineComponent, nextTick } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import IPC from '@/util/IPC'
  import { execPromiseRoot } from '@shared/Exec'
  import { BrewStore } from '@/store/brew'

  const { existsSync } = require('fs')
  const { readFile } = require('fs-extra')
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
      currentVersion() {
        const appStore = AppStore()
        const brewStore = BrewStore()
        const current = appStore.config.server?.rabbitmq?.current
        const installed = brewStore.module('rabbitmq').installed
        return installed?.find((i) => i.path === current?.path && i.version === current?.version)
      },
      password() {
        return AppStore().config.password
      }
    },
    watch: {
      type() {
        this.init()
      },
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
          this.monacoInstance = EditorCreate(input, EditorConfigMake(this.log, true, 'on'))
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
                  execPromiseRoot(['chmod', '777', this.filepath])
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
          readFileAsync(this.filepath)
            .then((log) => {
              this.log = log
            })
            .catch(() => {
              IPC.send('app-fork:caddy', 'fixLogPermit').then((key: string) => {
                IPC.off(key)
                readFileAsync(this.filepath).then((log) => {
                  this.log = log
                })
              })
            })
        } else {
          this.log = this.$t('base.noLogs')
        }
      },
      async init() {
        const v = this.currentVersion?.version?.split('.')?.[0] ?? ''
        if (!v) {
          this.filepath = ''
          return
        }
        const confFile = join(global.Server.BaseDir, 'rabbitmq', `rabbitmq-${v}.conf`)
        if (!existsSync(confFile)) {
          this.filepath = ''
          return
        }
        const logDir = join(global.Server.BaseDir, 'rabbitmq', `log-${v}`)
        const content = await readFile(confFile, 'utf-8')
        const name =
          content
            .split('\n')
            .find((s: string) => s.includes('NODENAME'))
            ?.split('=')
            ?.pop()
            ?.trim() ?? 'rabbit@localhost'
        this.filepath = join(logDir, `${name}.log`)
        this.getLog()
      }
    }
  })
</script>
