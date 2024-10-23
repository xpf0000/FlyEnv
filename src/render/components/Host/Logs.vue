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
        <template v-if="showSpring">
          <li :class="type === 'spring' ? 'active' : ''" @click="initType('spring')">SpringBoot</li>
        </template>
        <template v-if="showTomcat">
          <li :class="type === 'tomcat' ? 'active' : ''" @click="initType('tomcat')">Tomcat</li>
        </template>
        <template v-if="showCaddy !== false">
          <li :class="type === 'caddy' ? 'active' : ''" @click="initType('caddy')">Caddy</li>
        </template>
        <template v-if="showNginx !== false">
          <li :class="type === 'nginx-access' ? 'active' : ''" @click="initType('nginx-access')"
            >Nginx-Access</li
          >
          <li :class="type === 'nginx-error' ? 'active' : ''" @click="initType('nginx-error')"
            >Nginx-Error</li
          >
        </template>
        <template v-if="showApache !== false">
          <li :class="type === 'apache-access' ? 'active' : ''" @click="initType('apache-access')"
            >Apache-Access</li
          >
          <li :class="type === 'apache-error' ? 'active' : ''" @click="initType('apache-error')"
            >Apache-Error</li
          >
        </template>
      </ul>
      <LogVM ref="log" :log-file="filepath" />
      <div class="tool">
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('open')">{{
          I18nT('base.open')
        }}</el-button>
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('refresh')">{{
          I18nT('base.refresh')
        }}</el-button>
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('clean')">{{
          I18nT('base.clean')
        }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'

  const { join } = require('path')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = withDefaults(
    defineProps<{
      id?: string
      name: string
      showSpring?: boolean
      showTomcat?: boolean
      showNginx?: boolean
      showApache?: boolean
      showCaddy?: boolean
      logFile?: string
    }>(),
    {
      showNginx: true,
      showApache: true,
      showCaddy: true
    }
  )

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
      spring: join(global.Server.BaseDir, `java/${props.id}.log`),
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
    filepath.value = props?.logFile ?? logFile[t] ?? ''
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
