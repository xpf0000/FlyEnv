<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-logs">
      <ul class="top-tab">
        <li :class="type === 'caddy' ? 'active' : ''" @click="initType('caddy')">Caddy</li>
        <li :class="type === 'nginx-access' ? 'active' : ''" @click="initType('nginx-access')"
          >Nginx-Access</li
        >
        <li :class="type === 'nginx-error' ? 'active' : ''" @click="initType('nginx-error')"
          >Nginx-Error</li
        >
        <li :class="type === 'apache-access' ? 'active' : ''" @click="initType('apache-access')"
          >Apache-Access</li
        >
        <li :class="type === 'apache-error' ? 'active' : ''" @click="initType('apache-error')"
          >Apache-Error</li
        >
      </ul>
      <LogVM ref="log" :log-file="filepath" />
      <ToolVM :log="log" />
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'

  const { join } = require('path')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    name: string
  }>()

  const type = ref('')
  const filepath = ref('')
  const logfile = ref({})
  const log = ref()

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
