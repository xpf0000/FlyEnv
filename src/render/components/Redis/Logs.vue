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
          <el-button :disabled="!filepath" @click="logDo('clean')">{{ $t('base.clean') }}</el-button>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts">
import { defineComponent, nextTick } from 'vue'
import { writeFileAsync, readFileAsync } from '@shared/file'
import { AppStore } from '@/store/app'
import { EditorConfigMake, EditorCreate } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'

const { existsSync } = require('fs')
const { join } = require('path')
const { shell } = require('@electron/remote')

export default defineComponent({
  name: 'MoRedisLogs',
  components: {},
  props: {},
  data() {
    return {
      log: ''
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
    filepath() {
      if (this.vNum) {
        return join(global.Server.RedisDir, `redis-${this.vNum}.log`)
      }
      return undefined
    }
  },
  watch: {
    log() {
      nextTick().then(() => {
        this.initEditor()
      })
    },
    filepath: {
      handler(v) {
        if (v) {
          this.init()
        }
      },
      immediate: true
    }
  },
  created: function () { },
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
            .catch((e) => { MessageError(e.toString()) })
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
      this.getLog()
    }
  }
})
</script>
