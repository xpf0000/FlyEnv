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
          <span class="ml-15">php-fpm.conf</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>
      <div class="tool">
        <el-button :disabled="disabled" @click="openConfig">{{ $t('base.open') }}</el-button>
        <el-button :disabled="disabled" @click="saveConfig">{{ $t('base.save') }}</el-button>
        <el-button-group style="margin-left: 12px">
          <el-button :disabled="disabled" @click="loadCustom">{{
            $t('base.loadCustom')
          }}</el-button>
          <el-button :disabled="disabled" @click="saveCustom">{{
            $t('base.saveCustom')
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
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { SoftInstalled } from '@/store/brew'
  import { reloadService } from '@/util/Service'

  const { existsSync, statSync, mkdirp, writeFile } = require('fs-extra')
  const { join, dirname } = require('path')
  const { shell, dialog } = require('@electron/remote')

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const configPath = computed(() => {
    const num = props.item?.num ?? 0
    return join(global.Server.PhpDir!, `${num}/conf/php-fpm.conf`)
  })

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const saveCustom = () => {
    if (!monacoInstance) {
      return
    }
    const num = props.item?.num ?? 0
    let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
    const defaultPath = `php-${num}-fpm-custom.conf`
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
      if (props?.item?.run) {
        reloadService('php', props.item)
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

  const getConfig = async () => {
    const doRead = () => {
      readFileAsync(configPath.value).then((conf) => {
        config.value = conf
        initEditor()
        disabled.value = false
      })
    }
    if (!existsSync(configPath.value)) {
      if (!configPath.value) {
        return
      }
      const num = props.item.num
      const conf = `[global]
pid = run/php-fpm.pid
error_log = log/php-fpm.log
log_level = notice
[www]
listen = /tmp/phpwebstudy-php-cgi-${num}.sock
listen.allowed_clients = 127.0.0.1
pm = dynamic
pm.max_children = 20
pm.start_servers = 2
pm.min_spare_servers = 2
pm.max_spare_servers = 10
request_slowlog_timeout = 30
slowlog = log/php-fpm-slow.log
`
      await mkdirp(dirname(configPath.value))
      await writeFile(configPath.value, conf)
      doRead()
      return
    }
    doRead()
  }

  getConfig().then()
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
