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
  import { AsyncComponentSetup } from '../../fn'
  import type { AppHost } from '../../store/app'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '../../../src/shared/lang/index'

  const props = defineProps<{
    host: AppHost
  }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const hosts: Ref<Array<string>> = ref([])

  const getHosts = () => {
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

  const copy = () => {
    ElMessage.success(I18nT('base.linkCopySuccess'))
  }

  const open = () => {}

  getHosts()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
