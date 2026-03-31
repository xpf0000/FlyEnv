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
  import { ref, watch, nextTick } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    name: string
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

  const types = ref([
    {
      value: 'caddy',
      label: 'Caddy'
    },
    {
      value: 'nginx-access',
      label: 'Nginx-Access'
    },
    {
      value: 'nginx-error',
      label: 'Nginx-Error'
    },
    {
      value: 'apache-access',
      label: 'Apache-Access'
    },
    {
      value: 'apache-error',
      label: 'Apache-Error'
    }
  ])

  const init = () => {
    const logpath = join(window.Server.BaseDir!, 'vhost/logs')
    const accesslogng = join(logpath, `${props.name}.log`)
    const errorlogng = join(logpath, `${props.name}.error.log`)
    const accesslogap = join(logpath, `${props.name}-access_log`)
    const errorlogap = join(logpath, `${props.name}-error_log`)
    const caddyLog = join(logpath, `${props.name}.caddy.log`)
    logfile.value = {
      'nginx-access': accesslogng,
      'nginx-error': errorlogng,
      'apache-access': accesslogap,
      'apache-error': errorlogap,
      caddy: caddyLog
    }
  }

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
  initType(saveType)

  watch(type, (v) => {
    initType(v)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
