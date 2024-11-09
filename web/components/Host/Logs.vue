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
  import { AsyncComponentSetup } from '@web/fn'
  import LogVM from '@web/components/Log/index.vue'
  import ToolVM from '@web/components/Log/tool.vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineProps<{
    name: string
  }>()

  const type = ref('caddy')
  const filepath = ref('Log')
  const log = ref()

  const initType = (t: string) => {
    type.value = t
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
