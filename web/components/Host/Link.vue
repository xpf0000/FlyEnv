<template>
  <el-dialog
    v-model="show"
    :title="$t('base.siteLinks')"
    width="600px"
    :destroy-on-close="true"
    class="host-link-dialog"
    @closed="closedFn"
  >
    <div class="host-link">
      <template v-for="(item, index) of hosts" :key="index">
        <el-input :model-value="item" readonly>
          <template #append>
            <el-button-group>
              <el-button @click="copy(item)">{{ $t('base.copy') }}</el-button>
              <el-button @click="open(item)">{{ $t('base.open') }}</el-button>
            </el-button-group>
          </template>
        </el-input>
      </template>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref, Ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { AppHost } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import { MessageSuccess } from '@/util/Element'

  const { shell, clipboard } = require('@electron/remote')

  const props = defineProps<{
    host: AppHost
  }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const hosts: Ref<Array<string>> = ref([])

  const getHosts = () => {
    if (
      ['node', 'go', 'python', 'tomcat'].includes(props.host.type!) ||
      (props.host.type === 'java' && props.host.subType === 'springboot')
    ) {
      const url = `http://127.0.0.1:${props.host.projectPort}/`
      hosts.value.push(url)
      return
    }
    if (props.host.type === 'java' && props.host.subType === 'other') {
      let port: any = props.host.port?.tomcat ?? 80
      port = port === 80 ? '' : `:${port}`
      hosts.value.push(`http://${props.host.name}${port}/`)

      port = props.host.port?.tomcat_ssl ?? 443
      port = port === 443 ? '' : `:${port}`
      hosts.value.push(`https://${props.host.name}${port}/`)
      return
    }
    const alias = props.host.alias.split('\n').filter((n) => {
      return n && n.trim().length > 0
    })
    alias.unshift(props.host.name)
    const httpPort = [props.host.port.nginx, props.host.port.apache]
    alias.forEach((n) => {
      httpPort.forEach((p) => {
        const port = p === 80 ? '' : `:${p}`
        hosts.value.push(`http://${n}${port}/`)
      })
    })
    const httpsPort = [props.host.port.nginx_ssl, props.host.port.apache_ssl]
    alias.forEach((n) => {
      httpsPort.forEach((p) => {
        const port = p === 443 ? '' : `:${p}`
        hosts.value.push(`https://${n}${port}/`)
      })
    })
  }

  const copy = (url: string) => {
    clipboard.writeText(url)
    MessageSuccess(I18nT('base.linkCopySuccess'))
  }

  const open = (url: string) => {
    shell.openExternal(url)
  }

  getHosts()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
