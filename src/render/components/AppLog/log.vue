<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @open="onOpen"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('aside.appLog') }}</span>
        </div>
      </div>
      <div class="main-wapper">
        <div ref="log" class="block"></div>
      </div>
      <div class="tool">
        <el-tooltip :show-after="600" :content="I18nT('base.open')" placement="top">
          <el-button
            class="shrink0"
            :disabled="!AppLogStore.checkLogFile()"
            @click="AppLogStore.open()"
          >
            <FolderOpened class="w-5 h-5 p-0.5" />
          </el-button>
        </el-tooltip>
        <el-tooltip :show-after="600" :content="I18nT('base.clean')" placement="top">
          <el-button
            class="shrink0"
            :disabled="!AppLogStore.checkLogFile()"
            @click="AppLogStore.clean()"
          >
            <Notebook class="w-5 h-5 p-0.5" />
          </el-button>
        </el-tooltip>
      </div>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { FolderOpened, Notebook } from '@element-plus/icons-vue'
  import { AppLogStore } from '@/components/AppLog/store'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const log = ref()

  const logs = computed(() => {
    return AppLogStore.log.join('\n')
  })

  let isBottom = false
  let monacoInstance: editor.IStandaloneCodeEditor | null
  const initEditor = () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = log.value as any
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = EditorCreate(inputDom, EditorConfigMake(logs.value, true, 'on'))
      monacoInstance.setScrollTop(99999999)
      monacoInstance.onDidScrollChange(() => {
        const scrollTop = monacoInstance!.getScrollTop()
        const contentHeight = monacoInstance!.getContentHeight()
        const viewportHeight = monacoInstance!.getLayoutInfo().height

        // Check if scrolled to the bottom
        const isScrolledToBottom = scrollTop + viewportHeight >= contentHeight

        if (isScrolledToBottom) {
          // Logic for when scrolled to the bottom
          console.log('Scrolled to the bottom')
          isBottom = true
        } else {
          isBottom = false
        }
      })
    } else {
      monacoInstance.setValue(logs.value)
    }
  }

  const onOpen = () => {
    AppLogStore.index += 1
  }

  const close = () => {
    show.value = false
  }

  watch(logs, () => {
    initEditor()
    if (isBottom) {
      monacoInstance?.setScrollTop(99999999)
    }
  })

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
