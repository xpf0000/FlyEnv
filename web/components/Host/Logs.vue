<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-logs">
      <ul class="top-tab">
        <li :class="type === 'nginx-access' ? 'active' : ''" @click="initType('nginx-access')"
          >Nginx-Access</li
        >
        <li :class="type === 'nginx-error' ? 'active' : ''" @click="initType('nginx-error')"
          >Nginx-Error</li
        >
        <li :class="type === 'apache-access' ? 'active' : ''" @click="initType('apache-access')"
          >Apache-Access</li
        >
        <li :class="type === 'apache-error' ? 'active' : ''" @click="initType('apache-error')"
          >Apache-Error</li
        >
      </ul>
      <div ref="input" class="block"></div>
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
  import { nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { I18nT } from '../../../src/shared/lang/index'
  import { AsyncComponentSetup, EditorConfigMake } from '../../fn'
  import { ElMessage } from 'element-plus'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineProps<{
    name: string
  }>()

  const type = ref('')
  const filepath = ref('')
  const log = ref('')
  const logfile = ref({})

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

  const init = () => {
    logfile.value = {
      'nginx-access': 'accesslogng',
      'nginx-error': 'errorlogng',
      'apache-access': 'accesslogap',
      'apache-error': 'errorlogap'
    }
  }

  const getLog = () => {
    log.value = ''
  }

  const initType = (t: string) => {
    type.value = t
    const logFile: { [key: string]: string } = logfile.value
    filepath.value = logFile[t]
    getLog()
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
        ElMessage.success(I18nT('base.success'))
        break
    }
  }

  init()
  initType('nginx-access')

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style lang="scss">
  .host-logs {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 20px 20px 0 20px;
    background: #1d2033;
    .block {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 15px;
      textarea {
        height: 100%;
      }
    }
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        cursor: pointer;
        padding: 0 20px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
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
