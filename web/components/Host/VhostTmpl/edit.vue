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
          <span class="ml-15">{{ title }}</span>
        </div>
      </div>

      <Conf ref="conf" type-flag="xxx" :conf="content" file-ext="vhost" :show-commond="false">
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@web/fn'
  import Conf from '@web/components/Conf/drawer.vue'

  const props = defineProps<{
    flag: 'apache' | 'apacheSSL' | 'nginx' | 'nginxSSL' | 'caddy' | 'caddySSL'
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const conf = ref()

  const content = ref('')

  const title = computed(() => {
    const dict = {
      apache: I18nT('host.vhostApacheEdit'),
      apacheSSL: I18nT('host.vhostApacheSSLEdit'),
      nginx: I18nT('host.vhostNginxEdit'),
      nginxSSL: I18nT('host.vhostNginxSSLEdit'),
      caddy: I18nT('host.vhostCaddyEdit'),
      caddySSL: I18nT('host.vhostCaddySSLEdit')
    }
    return dict?.[props.flag] ?? ''
  })

  const files = {
    apache: import('@web/config/apache.vhost.txt?raw'),
    apacheSSL: import('@web/config/apacheSSL.vhost.txt?raw'),
    nginx: import('@web/config/nginx.vhost.txt?raw'),
    nginxSSL: import('@web/config/nginxSSL.vhost.txt?raw'),
    caddy: import('@web/config/caddy.vhost.txt?raw'),
    caddySSL: import('@web/config/caddySSL.vhost.txt?raw')
  }

  files[props.flag].then((res) => {
    content.value = res.default
    conf.value.update()
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
