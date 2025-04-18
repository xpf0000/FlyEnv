<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="flex flex-col overflow-hidden py-3 px-6 h-screen gap-4">
      <XRadioGroup v-model="type" class="mt-2" :data="types" @button-click="initType" />
      <LogVM ref="log" :log-file="filepath" class="flex-1 overflow-hidden" />
      <ToolVM :log="log" class="flex-shrink-0" />
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import XRadioGroup from '@/components/XRadioGroup/index.vue'

  const { join } = require('path')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    name: string
  }>()

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
    let logpath = join(global.Server.BaseDir, 'vhost/logs')
    let accesslogng = join(logpath, `${props.name}.log`)
    let errorlogng = join(logpath, `${props.name}.error.log`)
    let accesslogap = join(logpath, `${props.name}-access_log`)
    let errorlogap = join(logpath, `${props.name}-error_log`)
    let caddyLog = join(logpath, `${props.name}.caddy.log`)
    logfile.value = {
      'nginx-access': accesslogng,
      'nginx-error': errorlogng,
      'apache-access': accesslogap,
      'apache-error': errorlogap,
      caddy: caddyLog
    }
  }

  const initType = (t: string) => {
    type.value = t
    const logFile: { [key: string]: string } = logfile.value
    filepath.value = logFile[t] ?? ''
    localStorage.setItem('PhpWebStudy-Host-Log-Type', t)
  }

  init()
  const saveType = localStorage.getItem('PhpWebStudy-Host-Log-Type') ?? 'nginx-access'
  initType(saveType)

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
