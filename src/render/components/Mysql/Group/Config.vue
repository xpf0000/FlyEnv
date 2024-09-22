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
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('base.configFile') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
      <div class="tool">
        <el-button :disabled="disabled" @click="openConfig">{{ I18nT('base.open') }}</el-button>
        <el-button :disabled="disabled" @click="saveConfig">{{ I18nT('base.save') }}</el-button>
        <el-button-group style="margin-left: 12px">
          <el-button :disabled="disabled" @click="loadCustom">{{
            I18nT('base.loadCustom')
          }}</el-button>
          <el-button :disabled="disabled" @click="saveCustom">{{
            I18nT('base.saveCustom')
          }}</el-button>
        </el-button-group>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { I18nT } from '@shared/lang'
  import { EditorConfigMake, EditorCreate } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { MysqlGroupItem } from '@shared/app'
  import { MysqlStore } from '../mysql'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'

  const { existsSync, statSync, mkdirp, writeFile } = require('fs-extra')
  const { join, dirname } = require('path')
  const { shell, dialog } = require('@electron/remote')

  const props = defineProps<{
    item: MysqlGroupItem
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const mysqlStore = MysqlStore()

  const configPath = computed(() => {
    const id = props.item.id
    return join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
  })

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const saveCustom = () => {
    if (!monacoInstance) {
      return
    }
    let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    const defaultPath = `mysql-${props.item.id}-custom.conf`
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
    if (!monacoInstance) {
      return
    }
    if (!existsSync(configPath.value)) {
      return
    }
    const content = monacoInstance.getValue()
    writeFileAsync(configPath.value, content).then(() => {
      if (props?.item?.version?.running) {
        mysqlStore.start(props.item).then()
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
      .then(async ({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const file = filePaths[0]
        const state = statSync(file)
        if (state.size > 5 * 1024 * 1024) {
          MessageError(I18nT('base.fileBigErr'))
          return
        }
        await mkdirp(dirname(file))
        readFileAsync(file).then((conf) => {
          config.value = conf
          initEditor()
        })
      })
  }

  const openConfig = () => {
    shell.showItemInFolder(configPath.value)
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
      const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION`
      writeFile(configPath.value, conf).then(doRead)
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

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
