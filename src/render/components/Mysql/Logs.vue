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
import { EditorConfigMake, EditorCreate } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'

const { existsSync } = require('fs')
const { join } = require('path')
const { shell } = require('@electron/remote')

export default defineComponent({
  name: 'MoMysqlLogs',
  components: {},
  props: {
    type: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      filepath: '',
      log: ''
    }
  },
  computed: {
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
      this.filepath = join(global.Server.MysqlDir, `${this.type}.log`)
      this.getLog()
    }
  }
})
</script>
