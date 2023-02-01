<template>
  <el-drawer
    v-model="show"
    size="65%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="onDrawerClosed"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
          <span class="ml-15">{{ title }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('open')"
            >打开</el-button
          >
          <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('refresh')"
            >刷新</el-button
          >
          <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('clean')"
            >清空</el-button
          >
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
  import { writeFileAsync, readFileAsync } from '@shared/file.js'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { VueExtend } from '@/core/VueExtend.js'
  import { nextTick } from 'vue'

  const { existsSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  export default {
    show(data) {
      return new Promise(() => {
        let dom = document.createElement('div')
        document.body.appendChild(dom)
        let vm = VueExtend(this, data)
        const intance = vm.mount(dom)
        intance.onClosed = () => {
          dom && dom.remove()
          dom = null
          console.log('intance.onClosed !!!!!!')
        }
      })
    },
    components: {},
    props: {
      type: {
        type: String,
        default: ''
      },
      version: {
        type: Object,
        default() {
          return {}
        }
      }
    },
    data() {
      return {
        show: true,
        filepath: '',
        log: '',
        noLog: false
      }
    },
    computed: {
      title() {
        return this.type === 'php-fpm-slow' ? '慢日志' : 'FPM日志'
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
    methods: {
      close() {
        this.show = false
        this.$destroy()
        this.onClosed()
      },
      onDrawerClosed() {
        this.onClosed()
      },
      logDo(flag) {
        switch (flag) {
          case 'open':
            shell.showItemInFolder(this.filepath)
            break
          case 'refresh':
            this.getLog()
            break
          case 'clean':
            writeFileAsync(this.filepath, '').then(() => {
              this.log = ''
              this.$message.success('日志清空成功')
            })
            break
        }
      },
      getLog() {
        if (existsSync(this.filepath)) {
          this.noLog = false
          readFileAsync(this.filepath).then((log) => {
            this.log = log
            this.$nextTick(() => {
              this.initEditor()
            })
          })
        } else {
          this.log = ''
          this.noLog = true
          this.$nextTick(() => {
            this.initEditor()
          })
        }
      },
      init() {
        this.filepath = join(
          global.Server.PhpDir,
          `${this.version.num}`,
          `var/log/${this.type}.log`
        )
        this.getLog()
      },
      initEditor() {
        if (!this.monacoInstance) {
          if (!this?.$refs?.input?.style) {
            return
          }
          this.monacoInstance = editor.create(this.$refs.input, {
            value: this.log,
            language: 'ini',
            theme: 'vs-dark',
            scrollBeyondLastLine: true,
            overviewRulerBorder: true,
            automaticLayout: true,
            readOnly: true,
            wordWrap: 'on'
          })
          this.monacoInstance.revealLine(10000000, 1)
        } else {
          this.monacoInstance.setValue(this.log)
        }
      }
    }
  }
</script>

<style lang="scss">
  .host-vhost {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: hidden;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      flex-direction: column;

      > .block {
        width: 100%;
        flex: 1;
        overflow: hidden;
      }
      .tool {
        flex-shrink: 0;
        padding: 30px 0 20px 0;
      }
    }
  }
</style>
