<template>
  <div class="redis-config">
    <div ref="input" class="block"></div>
    <div class="tool">
      <el-button :disabled="disabled" @click="openConfig">{{ $t('base.open') }}</el-button>
      <el-button :disabled="disabled" @click="saveConfig">{{ $t('base.save') }}</el-button>
      <el-button :disabled="disabled" @click="getDefault">{{ $t('base.loadDefault') }}</el-button>
      <el-button-group style="margin-left: 12px">
        <el-button :disabled="disabled" @click="loadCustom">{{ $t('base.loadCustom') }}</el-button>
        <el-button :disabled="disabled" @click="saveCustom">{{ $t('base.saveCustom') }}</el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { writeFileAsync, readFileAsync } from '@shared/file'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { nextTick } from 'vue'
  import IPC from '@/util/IPC'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { startService } from '@/util/Service'
  import { FtpStore } from '@/store/ftp'

  const { dialog } = require('@electron/remote')
  const { existsSync, statSync } = require('fs')
  const { join } = require('path')
  const { shell } = require('@electron/remote')

  const ftpStore = FtpStore()
  const appStore = AppStore()
  const brewStore = BrewStore()

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null
  const configPath = join(global.Server.FTPDir, `pure-ftpd.conf`)

  const ftpVersion = computed(() => {
    const current = appStore.config.server?.['pure-ftpd']?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.['pure-ftpd']?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const ftpRunning = computed(() => {
    return ftpVersion?.value?.run === true
  })

  const saveCustom = () => {
    if (!monacoInstance) {
      return
    }
    let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    const defaultPath = 'pure-ftpd-custom.conf'
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
          ElMessage.success(I18nT('base.success'))
        })
      })
  }

  const saveConfig = () => {
    if (!monacoInstance) {
      return
    }
    const content = monacoInstance.getValue()
    writeFileAsync(configPath, content).then(() => {
      if (ftpRunning?.value) {
        startService('pure-ftpd', ftpVersion.value!).then()
      }
      ftpStore.getPort()
      ElMessage.success(I18nT('base.success'))
    })
  }

  const initEditor = () => {
    if (!monacoInstance) {
      const dom: HTMLElement = input?.value as any
      if (!dom || !dom?.style) {
        return
      }
      monacoInstance = editor.create(dom, {
        value: config.value,
        language: 'ini',
        theme: 'vs-dark',
        scrollBeyondLastLine: true,
        overviewRulerBorder: true,
        automaticLayout: true
      })
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
          ElMessage.error(I18nT('base.fileBigErr'))
          return
        }
        readFileAsync(file).then((conf) => {
          config.value = conf
          initEditor()
        })
      })
  }

  const openConfig = () => {
    shell.showItemInFolder(configPath)
  }

  const getDefault = () => {
    let configPath = join(global.Server.FTPDir, `pure-ftpd.conf.default`)
    if (!existsSync(configPath)) {
      ElMessage.error(I18nT('base.defaultConFileNoFound'))
      return
    }
    readFileAsync(configPath).then((conf) => {
      config.value = conf
      initEditor()
    })
  }

  const getConfig = () => {
    const doRead = () => {
      readFileAsync(configPath).then((conf) => {
        config.value = conf
        initEditor()
        disabled.value = false
      })
    }
    if (!existsSync(configPath)) {
      IPC.send('app-fork:pure-ftpd', 'initConf').then((key: string) => {
        IPC.off(key)
        doRead()
      })
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

<style lang="scss">
  .redis-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 10px 0 0 20px;
    .block {
      width: 100%;
      flex: 1;
      overflow: hidden;
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
    }
  }
</style>
