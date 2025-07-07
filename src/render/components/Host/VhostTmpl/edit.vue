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
          <span class="ml-3">{{ title }}</span>
        </div>
      </div>

      <Conf
        ref="conf"
        type-flag="caddy"
        :default-file="defaultFile"
        :file="file"
        file-ext="vhost"
        :show-commond="false"
      >
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import Conf from '@/components/Conf/drawer.vue'
  import { join, dirname } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const props = defineProps<{
    flag: 'apache' | 'apacheSSL' | 'nginx' | 'nginxSSL' | 'caddy' | 'caddySSL'
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const conf = ref()

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

  const file = computed(() => {
    return join(window.Server.BaseDir!, `VhostTemplate/${props.flag}.vhost`)
  })

  const files = {
    apache: join(window.Server.Static!, 'tmpl/apache.vhost'),
    apacheSSL: join(window.Server.Static!, 'tmpl/apacheSSL.vhost'),
    nginx: join(window.Server.Static!, 'tmpl/nginx.vhost'),
    nginxSSL: join(window.Server.Static!, 'tmpl/nginxSSL.vhost'),
    caddy: join(window.Server.Static!, 'tmpl/CaddyfileVhost'),
    caddySSL: join(window.Server.Static!, 'tmpl/CaddyfileVhostSSL')
  }
  const defaultFile = ref(files[props.flag])
  fs.existsSync(file.value).then((e) => {
    if (!e) {
      fs.mkdirp(dirname(file.value))
        .then(() => fs.copyFile(defaultFile.value, file.value))
        .then(() => {
          conf?.value?.update()
        })
    }
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
