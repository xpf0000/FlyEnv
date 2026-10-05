<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('base.hostsTitle') }}</span>
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

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { shell, fs } from '@/util/NodeFn.js'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { HostsFileLinux, HostsFileMacOS } from '@shared/PlatFormConst'
  import { FolderOpened } from '@element-plus/icons-vue'

  const config = ref('')
  // 读取成功才允许创建编辑器，覆盖 mounted 与异步读取的先后顺序。
  let configLoaded = false
  let configpath = ''
  if (window.Server.isMacOS) {
    configpath = HostsFileMacOS
  } else if (window.Server.isWindows) {
    // renderer 只使用 main 提供的路径，不导入 Node 系统查询或猜测 C: 盘。
    configpath = window.Server.WindowsHostsFile ?? ''
  } else {
    configpath = HostsFileLinux
  }
  const input = ref<HTMLElement | null>(null)
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const getConfig = async () => {
    try {
      // 读取失败必须阻止保存，不能把拒绝访问伪装成空文件再覆盖原 hosts。
      const conf = await fs.readFileStrict(configpath)
      config.value = conf
      configLoaded = true
      initEditor()
    } catch {
      configLoaded = false
      // 销毁旧编辑器，避免重读失败后继续保存先前的内容或错误提示文字。
      EditorDestroy(monacoInstance)
      monacoInstance = undefined
      config.value = I18nT('base.hostsReadFailed')
      // 未创建编辑器时仍提示读取失败，避免用户面对空白页面而无法判断原因。
      MessageError(config.value)
    }
  }

  const initEditor = async () => {
    if (!configLoaded) return
    if (!monacoInstance) {
      if (!input.value?.style) {
        return
      }
      monacoInstance = EditorCreate(input.value, await EditorConfigMake(config.value, false, 'off'))
      monacoInstance!.addAction({
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

  const openConfig = () => {
    shell.showItemInFolder(configpath)
  }

  const saveConfig = async () => {
    // 首次读取失败或编辑器尚未就绪时不能提交空 hosts；写入失败由 fs IPC 抛出。
    if (!monacoInstance) return
    try {
      const content = monacoInstance?.getValue() ?? ''
      await fs.writeFile(configpath, content)
      MessageSuccess(I18nT('base.success'))
    } catch {
      MessageError(I18nT('base.hostsSaveFailed'))
    }
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    EditorDestroy(monacoInstance)
  })

  // Initialize config
  getConfig()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
