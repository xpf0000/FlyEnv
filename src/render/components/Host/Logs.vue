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
  import { nextTick, ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import type { FSWatcher } from 'fs'
  import { I18nT } from '@shared/lang'
  import Base from '@/core/Base'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake } from '@/util/Editor'

  const { existsSync } = require('fs')
  const fsWatch = require('fs').watch
  const { exec } = require('child-process-promise')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    name: string
  }>()

  const appStore = AppStore()

  const type = ref('')
  const filepath = ref('')
  const log = ref('')
  const logfile = ref({})

  const password = computed(() => {
    return appStore.config.password
  })
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

  let watcher: FSWatcher | null

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
    if (watcher) {
      watcher.close()
      watcher = null
    }
  })

  const init = () => {
    let logpath = join(global.Server.BaseDir, 'vhost/logs')
    let accesslogng = join(logpath, `${props.name}.log`)
    let errorlogng = join(logpath, `${props.name}.error.log`)
    let accesslogap = join(logpath, `${props.name}-access_log`)
    let errorlogap = join(logpath, `${props.name}-error_log`)
    logfile.value = {
      'nginx-access': accesslogng,
      'nginx-error': errorlogng,
      'apache-access': accesslogap,
      'apache-error': errorlogap
    }
  }

  const getLog = () => {
    if (existsSync(filepath.value)) {
      const watchLog = () => {
        if (!watcher) {
          watcher = fsWatch(filepath.value, () => {
            read()
          })
        }
      }
      const read = () => {
        readFileAsync(filepath.value).then((str) => {
          log.value = str
        })
      }
      read()
      watchLog()
    } else {
      log.value = I18nT('base.noLogs')
    }
  }

  const initType = (t: string) => {
    type.value = t
    const logFile: { [key: string]: string } = logfile.value
    filepath.value = logFile[t]
    getLog()
  }

  const logDo = (flag: string) => {
    if (!existsSync(filepath.value)) {
      Base.MessageError(I18nT('base.noFoundLogFile'))
      return
    }
    switch (flag) {
      case 'open':
        shell.showItemInFolder(filepath.value)
        break
      case 'refresh':
        getLog()
        break
      case 'clean':
        writeFileAsync(filepath.value, '')
          .then(() => {
            log.value = ''
            Base.MessageSuccess(I18nT('base.success'))
          })
          .catch(() => {
            if (!password.value) {
              EventBus.emit('vue:need-password')
            } else {
              exec(`echo '${password.value}' | sudo -S chmod 777 ${filepath.value}`)
                .then(() => {
                  logDo('clean')
                })
                .catch(() => {
                  EventBus.emit('vue:need-password')
                })
            }
          })
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
