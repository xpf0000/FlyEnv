<template>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="75%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ $t('base.vhostConTitle') }}</span>
        </div>
      </div>

      <div class="main-wapper">
        <div ref="input" class="block"></div>
      </div>

      <div class="tool">
        <el-button-group>
          <el-tooltip :show-after="600" :content="I18nT('conf.open')" placement="top">
            <el-button @click="openConfig">
              <FolderOpened class="w-5 h-5 p-0.5" />
            </el-button>
          </el-tooltip>
          <el-tooltip :show-after="600" :content="I18nT('conf.save')" placement="top">
            <el-button @click="saveConfig">
              <yb-icon :svg="import('@/svg/save.svg?raw')" class="w-5 h-5 p-0.5" />
            </el-button>
          </el-tooltip>
        </el-button-group>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { MessageSuccess } from '@/util/Element'
  import { reloadWebServer } from '@/util/Service'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { shell, fs } from '@/util/NodeFn'
  import { FolderOpened } from '@element-plus/icons-vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{
    item: any
    file?: string
  }>()
  const config = ref('')
  const configpath = ref('')
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const openConfig = () => {
    shell.showItemInFolder(configpath.value)
  }

  const saveConfig = () => {
    const content = monacoInstance?.getValue() ?? ''
    fs.writeFile(configpath.value, content).then(() => {
      MessageSuccess(I18nT('base.success'))
      reloadWebServer()
    })
  }

  const getConfig = () => {
    fs.existsSync(configpath.value).then((e) => {
      if (e) {
        fs.readFile(configpath.value).then((conf: string) => {
          config.value = conf
          initEditor()
        })
      } else {
        IPC.send('app-fork:host', 'initAllConf', JSON.parse(JSON.stringify(props.item.item))).then(
          (key: string) => {
            IPC.off(key)
            fs.readFile(configpath.value).then((conf: string) => {
              config.value = conf
              initEditor()
            })
          }
        )
      }
    })
  }
  const initEditor = async () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = EditorCreate(input.value, await EditorConfigMake(config.value, false, 'off'))
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

  const baseDir = window.Server.BaseDir!
  configpath.value =
    props?.file ?? join(baseDir, 'vhost', props.item.flag, `${props.item.item.name}.conf`)
  getConfig()

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    EditorDestroy(monacoInstance)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
