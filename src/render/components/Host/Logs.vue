<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="flex flex-col overflow-hidden h-screen gap-4">
      <el-radio-group v-model="type" class="mt-4 px-3 flex-shrink-0">
        <template v-for="(item, _index) in types" :key="_index">
          <el-radio-button :value="item.value" :label="item.label"></el-radio-button>
        </template>
      </el-radio-group>
      <LogVM ref="log" :log-file="filepath" class="flex-1 overflow-hidden" />
      <ToolVM :log="log" class="flex-shrink-0 px-3 pb-4" />
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { fs } from '@/util/NodeFn'
  import { ref, watch, nextTick, computed } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    name: string
    id: string | number
  }>()

  watch(show, (v) => {
    if (v) {
      void doRefresh()
    }
  })

  const type = ref('')
  const filepath = ref('')
  const logfile = ref({})
  const log = ref()

  const init = () => {
    const logpath = join(window.Server.BaseDir!, 'vhost/logs')
    // #700: log files are named by host.id (unique, rename-stable), not
    // host.name, so multiple same-name sites don't share log files.
    const base = props.id
    const accesslogng = join(logpath, `${base}.log`)
    const errorlogng = join(logpath, `${base}.error.log`)
    const accesslogap = join(logpath, `${base}-access_log`)
    const errorlogap = join(logpath, `${base}-error_log`)
    const caddyLog = join(logpath, `${base}.caddy.log`)
    const frankenphpLog = join(logpath, `${base}.frankenphp.log`)
    logfile.value = {
      'nginx-access': accesslogng,
      'nginx-error': errorlogng,
      'apache-access': accesslogap,
      'apache-error': errorlogap,
      caddy: caddyLog,
      frankenphp: frankenphpLog
    }
  }
  const appStore = AppStore()
  const brewStore = BrewStore()
  const apacheEnable = computed(() => {
    return (
      appStore.config.setup.common.showItem?.apache !== false &&
      brewStore.module('apache').installed.length > 0
    )
  })

  const nginxEnable = computed(() => {
    return (
      appStore.config.setup.common.showItem?.nginx !== false &&
      brewStore.module('nginx').installed.length > 0
    )
  })

  const caddyEnable = computed(() => {
    return (
      appStore.config.setup.common.showItem?.caddy !== false &&
      brewStore.module('caddy').installed.length > 0
    )
  })

  const frankenphpEnable = computed(() => {
    return (
      appStore.config.setup.common.showItem?.frankenphp !== false &&
      brewStore.module('frankenphp').installed.length > 0
    )
  })

  const types = computed(() => {
    return [
      {
        value: 'caddy',
        label: 'Caddy',
        show: caddyEnable.value
      },
      {
        value: 'frankenphp',
        label: 'FrankenPHP',
        show: frankenphpEnable.value
      },
      {
        value: 'nginx-access',
        label: 'Nginx-Access',
        show: nginxEnable.value
      },
      {
        value: 'nginx-error',
        label: 'Nginx-Error',
        show: nginxEnable.value
      },
      {
        value: 'apache-access',
        label: 'Apache-Access',
        show: apacheEnable.value
      },
      {
        value: 'apache-error',
        label: 'Apache-Error',
        show: apacheEnable.value
      }
    ]
  })

  const doRefresh = async () => {
    await nextTick()

    if (show.value && (await fs.existsSync(filepath.value))) {
      log.value?.logDo?.('refresh')
    }
  }

  const initType = async (t: string) => {
    type.value = t
    const logFile: { [key: string]: string } = logfile.value
    filepath.value = logFile[t] ?? ''
    localStorage.setItem('FlyEnv-Host-Log-Type', t)
    await doRefresh()
  }

  init()
  const saveType = localStorage.getItem('FlyEnv-Host-Log-Type') ?? 'nginx-access'
  const find = types.value.find((t) => t.value === saveType && t.show)
  if (find) {
    initType(saveType)
  } else {
    const find = types.value.find((t) => t.show)
    if (find) {
      initType(find.value)
    }
  }

  watch(type, (v) => {
    initType(v)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
