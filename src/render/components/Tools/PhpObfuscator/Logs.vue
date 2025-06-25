<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('base.errorLog') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick } from 'vue'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps({
    content: {
      type: String,
      default: ''
    }
  })

  const input = ref<HTMLElement | null>(null)
  const monacoInstance = ref<any>(null)

  const initEditor = () => {
    if (!monacoInstance.value) {
      if (!input.value || !input.value?.style) {
        return
      }
      const editorConfig = EditorConfigMake(props.content, true, 'on')
      editorConfig.language = 'javascript'
      monacoInstance.value = EditorCreate(input.value, editorConfig)
    } else {
      monacoInstance.value.setValue(props.content)
    }
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
