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
          <span class="ml-15">php.ini</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
        <div class="tool">
          <el-button :disabled="!configpath" @click="openConfig">{{ $t('base.open') }}</el-button>
          <el-button :disabled="!configpath" @click="saveConfig">{{ $t('base.save') }}</el-button>
          <el-button :disabled="!configpath" @click="getDefault">{{
            $t('base.loadDefault')
          }}</el-button>
          <el-button-group style="margin-left: 12px">
            <el-button :disabled="!configpath" @click="loadCustom">{{
              $t('base.loadCustom')
            }}</el-button>
            <el-button :disabled="!configpath" @click="saveCustom">{{
              $t('base.saveCustom')
            }}</el-button>
          </el-button-group>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts">
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, defineComponent } from 'vue'
  import { VueExtend } from '../../VueExtend'
  import Conf from '../../config/php.conf.txt?raw'

  const IniFiles: { [key: string]: any } = {}

  export default defineComponent({
    show(data: any) {
      return new Promise(() => {
        let dom: HTMLElement | null = document.createElement('div')
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
        config: '',
        configpath: ''
      }
    },
    computed: {
      phpRunning() {
        return this?.version?.run
      },
      versionDir() {
        return this.version?.path ?? ''
      }
    },
    watch: {
      versionDir: {
        handler(val) {
          if (val) {
            this.getConfig()
          }
        },
        immediate: true
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
    },
    methods: {
      loadCustom() {},
      saveCustom() {},
      close() {
        this.show = false
        this.$destroy()
        this.onClosed()
      },
      onDrawerClosed() {
        this.onClosed()
      },
      openConfig() {},
      saveConfig() {},
      getConfig() {
        if (!this.versionDir) {
          this.config = this.$t('base.selectPhpVersion')
          return
        }
        const readConfig = () => {
          const flag = this.version?.phpBin ?? this.versionDir
          this.configpath = IniFiles[flag]
          this.config = Conf
          this.initEditor()
        }
        readConfig()
      },
      getDefault() {
        if (!this.configpath) {
          return
        }
        this.config = Conf
        this.initEditor()
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
