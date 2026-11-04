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
            <el-button :disabled="unixSaving" :loading="unixSaving" @click="saveConfig">
              <yb-icon :svg="import('@/svg/save.svg?raw')" class="w-5 h-5 p-0.5" />
            </el-button>
          </el-tooltip>
        </el-button-group>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
  import { KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { shell, fs } from '@/util/NodeFn.js'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { HostsFileLinux, HostsFileMacOS } from '@shared/PlatFormConst'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { readUnixHosts, UnixHostsEditor, reconcileUnixHostsSave } from './UnixHosts'

  const config = ref('')
  // 读取成功才允许创建编辑器，覆盖 mounted 与异步读取的先后顺序。
  let configLoaded = false
  let hostsDigest = ''
  let alive = true
  const unixSaving = computed(() => !window.Server.isWindows && UnixHostsEditor.saving)
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

  const getConfig = async (submitted?: string) => {
    try {
      // 读取失败必须阻止保存，不能把拒绝访问伪装成空文件再覆盖原 hosts。
      let conf: string
      if (!window.Server.isWindows) {
        let snapshot = await readUnixHosts()
        if (submitted !== undefined && monacoInstance) {
          snapshot = reconcileUnixHostsSave(
            snapshot,
            submitted,
            monacoInstance.getValue(),
            hostsDigest
          )
        }
        conf = snapshot.content
        hostsDigest = snapshot.digest
      } else conf = await fs.readFileStrict(configpath)
      if (!alive) return
      config.value = conf
      configLoaded = true
      initEditor()
    } catch {
      if (!alive) return
      configLoaded = false
      // 销毁旧编辑器，避免重读失败后继续保存先前的内容或错误提示文字。
      EditorDestroy(monacoInstance)
      monacoInstance = undefined
      config.value = I18nT('base.hostsReadFailed', { path: configpath })
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
      if (!window.Server.isWindows) {
        if (!(await UnixHostsEditor.save(content, hostsDigest))) return
        // Reload the saved version so subsequent edits retain conflict protection.
        if (alive) await getConfig(content)
      } else {
        await fs.writeFile(configpath, content)
        MessageSuccess(I18nT('base.success'))
      }
    } catch (error) {
      MessageError(`${I18nT('base.hostsSaveFailed')}: ${error}`)
    }
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    alive = false
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
