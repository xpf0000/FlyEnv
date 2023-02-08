<template>
  <div class="memcached-config">
    <el-input v-model="log" resize="none" class="block" :readonly="true" type="textarea"></el-input>
    <div class="tool">
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('open')">打开</el-button>
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('refresh')">刷新</el-button>
      <el-button class="shrink0" :disabled="!filepath" @click="logDo('clean')">清空</el-button>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'

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
    watch: {},
    created: function () {
      this.init()
    },
    methods: {
      logDo(flag: string) {
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
                this.$message.success('日志清空成功')
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
            this.$nextTick(() => {
              let container = this.$el.querySelector('textarea')
              if (container) {
                container.scrollTop = container.scrollHeight
              }
            })
          })
        } else {
          this.log = '当前无日志'
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
    padding: 20px 0 0 20px;
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
