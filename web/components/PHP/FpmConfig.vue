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
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake, EditorCreate } from '@web/fn'
  import { AsyncComponentSetup } from '@web/fn'
  import { SoftInstalled } from '@web/store/brew'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const config = ref('')
  const disabled = ref(true)
  const input = ref()
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const saveCustom = () => {}

  const saveConfig = () => {}

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

  const loadCustom = () => {}

  const openConfig = () => {}

  const getConfig = async () => {
    const num = props.item.num
    config.value = `[global]
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
    initEditor()
    disabled.value = false
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
