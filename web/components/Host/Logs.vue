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
        <li :class="type === 'caddy' ? 'active' : ''" @click="initType('caddy')">Caddy</li>
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
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup, EditorConfigMake, EditorCreate } from '@web/fn'
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
      monacoInstance = EditorCreate(inputDom, EditorConfigMake(log.value, true, 'on'))
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
      caddy: 'caddy',
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
