<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="onDrawerClosed"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ $t('base.hostsTitle') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>

      <div class="tool">
        <el-button @click="openConfig">{{ $t('base.open') }}</el-button>
        <el-button @click="saveConfig">{{ $t('base.save') }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script>
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { nextTick } from 'vue'
  import IPC from '@/util/IPC.ts'
  import { VueExtend } from '@/core/VueExtend.ts'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor.ts'
  import { MessageError, MessageSuccess } from '@/util/Element.ts'
  import { shell, fs } from '@/util/NodeFn.js'

  export default {
    show(data) {
      return new Promise(() => {
        let dom = document.createElement('div')
        document.body.appendChild(dom)
        const vm = VueExtend(this, data)
        const intance = vm.mount(dom)
        intance.onClosed = () => {
          dom?.remove?.()
          dom = null
          console.log('intance.onClosed !!!!!!')
        }
      })
    },
    components: {},
    props: {},
    data() {
      return {
        show: true,
        config: '',
        configpath: 'c:/windows/system32/drivers/etc/hosts'
      }
    },
    computed: {},
    created: function () {
      IPC.send('app-fork:host', 'doFixHostsRole').then((key) => {
        IPC.off(key)
        this.getConfig()
      })
    },
    mounted() {
      nextTick().then(() => {
        this.initEditor()
      })
    },
    unmounted() {
      this.monacoInstance?.dispose?.()
      this.monacoInstance = null
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
      openConfig() {
        shell.showItemInFolder(this.configpath)
      },
      saveConfig() {
        const content = this.monacoInstance.getValue()
        fs.writeFile(this.configpath, content)
          .then(() => {
            MessageSuccess(this.$t('base.success'))
          })
          .catch(() => {
            MessageError(this.$t('base.hostsSaveFailed'))
          })
      },
      getConfig() {
        fs.readFile(this.configpath)
          .then((conf) => {
            this.config = conf
            this.initEditor()
          })
          .catch(() => {
            this.config = this.$t('base.hostsReadFailed')
            this.initEditor()
          })
      },
      initEditor() {
        if (!this.monacoInstance) {
          if (!this?.$refs?.input?.style) {
            return
          }
          this.monacoInstance = EditorCreate(
            this.$refs.input,
            EditorConfigMake(this.config, false, 'off')
          )
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
  }
</script>
