<template>
  <el-drawer v-model="show" size="75%" :destroy-on-close="true" :with-header="false" @closed="closedFn">
    <div class="host-logs">
      <ul class="top-tab">
        <li :class="type === 'caddy' ? 'active' : ''" @click="initType('caddy')">Caddy</li>
        <li :class="type === 'nginx-access' ? 'active' : ''" @click="initType('nginx-access')">Nginx-Access</li>
        <li :class="type === 'nginx-error' ? 'active' : ''" @click="initType('nginx-error')">Nginx-Error</li>
        <li :class="type === 'apache-access' ? 'active' : ''" @click="initType('apache-access')">Apache-Access</li>
        <li :class="type === 'apache-error' ? 'active' : ''" @click="initType('apache-error')">Apache-Error</li>
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
import type { FSWatcher } from 'fs'
import { I18nT } from '@shared/lang'
import { AsyncComponentSetup } from '@/util/AsyncComponent'
import { EditorConfigMake, EditorCreate } from '@/util/Editor'
import { MessageError, MessageSuccess } from '@/util/Element'

const { existsSync } = require('fs')
const fsWatch = require('fs').watch
const { exec } = require('child-process-promise')
const { join } = require('path')
const { shell } = require('@electron/remote')

const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

const props = defineProps<{
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
  let caddyLog = join(logpath, `${props.name}.caddy.log`)
  logfile.value = {
    'nginx-access': accesslogng,
    'nginx-error': errorlogng,
    'apache-access': accesslogap,
    'apache-error': errorlogap,
    caddy: caddyLog
  }
}

const getLog = () => {
  if (existsSync(filepath.value)) {
    const watchLog = () => {
      if (!watcher) {
        watcher = fsWatch(filepath.value, () => {
          read().then()
        })
      }
    }
    const read = () => {
      return new Promise((resolve) => {
        readFileAsync(filepath.value)
          .then((str) => {
            log.value = str
            resolve(true)
          })
          .catch((e) => {
            MessageError(e.toString())
          })
      })
    }
    read().then(() => {
      watchLog()
    })
  } else {
    log.value = I18nT('base.noLogs')
  }
}

const initType = (t: string) => {
  type.value = t
  const logFile: { [key: string]: string } = logfile.value
  filepath.value = logFile[t]
  getLog()
  localStorage.setItem('PhpWebStudy-Host-Log-Type', t)
}

const logDo = (flag: string) => {
  if (!existsSync(filepath.value)) {
    MessageError(I18nT('base.noFoundLogFile'))
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
          MessageSuccess(I18nT('base.success'))
        })
        .catch((e) => {
          MessageError(e.toString())
        })
      break
  }
}

init()
const saveType = localStorage.getItem('PhpWebStudy-Host-Log-Type') ?? 'nginx-access'
initType(saveType)

defineExpose({
  show,
  onSubmit,
  onClosed
})
</script>
