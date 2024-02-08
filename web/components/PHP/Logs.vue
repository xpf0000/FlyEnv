<template>
  <el-drawer
    v-model="show"
    size="75%"
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
      </div>

      <div class="tool">
        <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('open')">{{
            $t('base.open')
          }}</el-button>
        <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('refresh')">{{
            $t('base.refresh')
          }}</el-button>
        <el-button class="shrink0" :disabled="!filepath || noLog" @click="logDo('clean')">{{
            $t('base.clean')
          }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts">
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { VueExtend } from '../../VueExtend'
  import { nextTick, defineComponent } from 'vue'
  import { EditorConfigMake } from '../../fn'

  export default defineComponent({
    show(data: any) {
      return new Promise(() => {
        let dom: HTMLElement | null = document.createElement('div')
        document.body.appendChild(dom)
        let vm = VueExtend(this, data)
        const intance = vm.mount(dom)
        intance.onClosed = () => {
          vm.unmount()
          dom && dom.remove()
          dom = null
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
        return this.type === 'php-fpm-slow' ? this.$t('base.slowLog') : this.$t('php.fpmLog')
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
        this.onClosed()
      },
      onDrawerClosed() {
        this.onClosed()
      },
      logDo(flag: string) {
        switch (flag) {
          case 'open':
            break
          case 'refresh':
            this.getLog()
            break
          case 'clean':
            this.log = ''
            this.$message.success(this.$t('base.success'))
            break
        }
      },
      getLog() {
        this.log = ''
        this.$nextTick(() => {
          this.initEditor()
        })
      },
      init() {
        this.filepath = 'dsdsdsdd'
        this.getLog()
      },
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          this.monacoInstance = editor.create(input, EditorConfigMake(this.log, true, 'on'))
          this.monacoInstance.revealLine(10000000, 1)
        } else {
          this.monacoInstance.setValue(this.log)
        }
      }
    }
  })
</script>
