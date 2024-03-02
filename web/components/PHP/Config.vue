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
      </div>

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
  </el-drawer>
</template>

<script lang="ts">
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick, defineComponent } from 'vue'
  import { VueExtend } from '../../VueExtend'
  import Conf from '../../config/php.conf.txt?raw'
  import { EditorConfigMake } from '../../fn'

  const IniFiles: { [key: string]: any } = {}

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
          this.monacoInstance = editor.create(input, EditorConfigMake(this.config, false, 'off'))
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
