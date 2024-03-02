<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ title }}</span>
        </div>
      </div>
      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
      <div class="tool">
        <el-button class="shrink0" :disabled="!filepath" @click="logDo('open')">{{
          $t('base.open')
        }}</el-button>
        <el-button class="shrink0" :disabled="!filepath" @click="logDo('refresh')">{{
          $t('base.refresh')
        }}</el-button>
        <el-button class="shrink0" :disabled="!filepath" @click="logDo('clean')">{{
          $t('base.clean')
        }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { nextTick, ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@web/fn'
  import { EditorConfigMake } from '@web/fn'
  import { MessageSuccess } from '@/util/Element'
  import type { MysqlGroupItem } from '@shared/app'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: MysqlGroupItem
    flag: 'log' | 'slow-log'
  }>()

  const log = ref('')

  const title = computed(() => {
    if (props.flag === 'log') {
      return I18nT('base.log')
    }
    return I18nT('base.slowLog')
  })

  const filepath = computed(() => {
    return ''
  })

  const close = () => {
    show.value = false
  }

  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null
  const initEditor = () => {
    if (!monacoInstance) {
      const inputDom: HTMLElement = input.value as HTMLElement
      if (!inputDom || !inputDom?.style) {
        return
      }
      monacoInstance = editor.create(inputDom, EditorConfigMake(log.value, true, 'on'))
    } else {
      monacoInstance.setValue(log.value)
    }
  }

  watch(log, () => {
    nextTick().then(() => {
      initEditor()
    })
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

  const getLog = () => {
    log.value = ''
  }

  const logDo = (flag: string) => {
    switch (flag) {
      case 'open':
        break
      case 'refresh':
        getLog()
        break
      case 'clean':
        log.value = ''
        MessageSuccess(I18nT('base.success'))
        break
    }
  }

  getLog()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
