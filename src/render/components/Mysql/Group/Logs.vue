<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="log-popper">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
          <span class="ml-15">{{ title }}</span>
        </div>
      </div>
      <div class="main-wapper">
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
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { nextTick, ref, computed, watch, onMounted, onUnmounted } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { EventBus } from '@/global'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { MysqlGroupItem } from '@shared/app'
  import { AppStore } from '@/store/app'

  const { existsSync } = require('fs')
  const { exec } = require('child-process-promise')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: MysqlGroupItem
    flag: 'log' | 'slow-log'
  }>()

  const log = ref('')
  const appStore = AppStore()

  const password = computed(() => {
    return appStore.config.password
  })

  const title = computed(() => {
    if (props.flag === 'log') {
      return I18nT('base.log')
    }
    return I18nT('base.slowLog')
  })

  const filepath = computed(() => {
    const v = props.item?.version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
    const p = props.item?.port ?? ''
    if (props.flag === 'log') {
      return join(global.Server.MysqlDir!, `group/my-group-${v}-${p}-error.log`)
    }
    return join(global.Server.MysqlDir!, `group/my-group-${v}-${p}-slow.log`)
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
    if (existsSync(filepath.value)) {
      const read = () => {
        readFileAsync(filepath.value).then((str) => {
          log.value = str
        })
      }
      read()
    } else {
      log.value = I18nT('base.noLogs')
    }
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

  getLog()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>

<style lang="scss"></style>
