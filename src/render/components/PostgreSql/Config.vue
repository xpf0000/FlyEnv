<template>
  <div class="module-config">
    <el-card>
      <div ref="input" class="block"></div>
      <template #footer>
        <div class="tool">
          <el-button :disabled="disabled" @click="openConfig">{{ $t('base.open') }}</el-button>
          <el-button :disabled="disabled" @click="saveConfig">{{ $t('base.save') }}</el-button>
          <el-button :disabled="disabled" @click="getDefault">{{
            $t('base.loadDefault')
          }}</el-button>
          <el-button-group style="margin-left: 12px">
            <el-button :disabled="disabled" @click="loadCustom">{{
              $t('base.loadCustom')
            }}</el-button>
            <el-button :disabled="disabled" @click="saveCustom">{{
              $t('base.saveCustom')
            }}</el-button>
          </el-button-group>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { startService } from '@/util/Service'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { dialog } = require('@electron/remote')
  const { existsSync, statSync } = require('fs')
  const { join, dirname } = require('path')
  const { shell } = require('@electron/remote')

  const appStore = AppStore()
  const brewStore = BrewStore()

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const currentVersion = computed(() => {
    const current = appStore.config.server?.postgresql?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore.module('postgresql').installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceRunning = computed(() => {
    return currentVersion?.value?.run === true
  })

  const configPath = computed(() => {
    if (!currentVersion?.value) {
      return ''
    }
    const version = currentVersion?.value?.version ?? ''
    const versionTop = version.split('.').shift()
    const dbPath = join(global.Server.PostgreSqlDir, `postgresql${versionTop}`)
    return join(dbPath, 'postgresql.conf')
  })

  const saveCustom = () => {
    if (!monacoInstance) {
      return
    }
    let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    const defaultPath = 'postgresql-custom.conf'
    dialog
      .showSaveDialog({
        properties: opt,
        defaultPath: defaultPath,
        filters: [
          {
            extensions: ['conf']
          }
        ]
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const content = monacoInstance?.getValue() ?? ''
        writeFileAsync(filePath, content).then(() => {
          MessageSuccess(I18nT('base.success'))
        })
      })
  }

  const saveConfig = () => {
    if (!monacoInstance || !configPath?.value) {
      return
    }
    const content = monacoInstance.getValue()
    writeFileAsync(configPath.value, content).then(() => {
      if (serviceRunning?.value) {
        startService('postgresql', currentVersion.value!).then()
      }
      MessageSuccess(I18nT('base.success'))
    })
  }

  const initEditor = () => {
    if (!monacoInstance) {
      const dom: HTMLElement = input?.value as any
      if (!dom || !dom?.style) {
        return
      }
      monacoInstance = EditorCreate(dom, EditorConfigMake(config.value, false, 'off'))
      monacoInstance.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          saveConfig()
        }
      })
    } else {
      monacoInstance.setValue(config.value)
    }
  }

  const loadCustom = () => {
    let opt = ['openFile', 'showHiddenFiles']
    dialog
      .showOpenDialog({
        properties: opt
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const file = filePaths[0]
        const state = statSync(file)
        if (state.size > 5 * 1024 * 1024) {
          MessageError(I18nT('base.fileBigErr'))
          return
        }
        readFileAsync(file).then((conf) => {
          config.value = conf
          initEditor()
        })
      })
  }

  const openConfig = () => {
    shell.showItemInFolder(configPath.value)
  }

  const getDefault = () => {
    let defaultConfPath = join(dirname(configPath.value), `postgresql.conf.default`)
    if (!existsSync(defaultConfPath)) {
      MessageError(I18nT('base.defaultConFileNoFound'))
      return
    }
    readFileAsync(defaultConfPath).then((conf) => {
      config.value = conf
      initEditor()
    })
  }

  const getConfig = () => {
    const doRead = () => {
      readFileAsync(configPath.value).then((conf) => {
        config.value = conf
        initEditor()
        disabled.value = false
      })
    }
    if (!existsSync(configPath.value)) {
      config.value = I18nT('base.needSelectVersion')
      return
    }
    doRead()
  }

  getConfig()
  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })
</script>
