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
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ $t('php.obfuscatorErrorLog') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts">
  import { VueExtend } from '@web/core/VueExtend'
  import { nextTick, defineComponent } from 'vue'
  import { EditorConfigMake, EditorCreate } from '@web/fn'

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
        }
      })
    },
    components: {},
    props: {
      content: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        show: true
      }
    },
    computed: {},
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
      initEditor() {
        if (!this.monacoInstance) {
          const input: HTMLElement = this?.$refs?.input as HTMLElement
          if (!input || !input?.style) {
            return
          }
          const editorConfig = EditorConfigMake(this.content, true, 'on')
          editorConfig.language = 'javascript'
          this.monacoInstance = EditorCreate(input, editorConfig)
        } else {
          this.monacoInstance.setValue(this.content)
        }
      }
    }
  })
</script>
