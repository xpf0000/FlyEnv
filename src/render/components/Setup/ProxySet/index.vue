<template>
  <el-form-item :label="$t('base.proxySetting')" label-position="left" label-width="110">
    <el-radio-group v-model="form.status" @change="saveStatus">
      <el-radio-button :label="$t('base.enable')" :value="true"></el-radio-button>
      <el-radio-button :label="$t('base.disable')" :value="false"></el-radio-button>
    </el-radio-group>
  </el-form-item>

  <div v-if="form.status" class="show-content">
    <el-form @submit.prevent>
      <el-form-item>
        <el-input
          v-model="form.fastProxy"
          placeholder="eg: 127.0.0.1:8090"
          style="max-width: 255px"
          @change="fastSetSubmit"
        >
          <template #prepend>
            <span>{{ $t('base.quickSetup') }}</span>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item>
        <el-input v-model.trim="form.proxyStr" style="max-width: 255px" @change="proxySubmit">
          <template #prepend>
            <span>{{ $t('base.currentProxy') }}</span>
          </template>
          <template #append>
            <el-button @click="copyProxy">{{ $t('base.copy') }}</el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, computed, ref } from 'vue'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'
  import { MessageSuccess } from '@/util/Element'
  const { clipboard } = require('@electron/remote')

  const store = AppStore()
  const form = ref({
    fastProxy: '',
    proxyStr: '',
    status: false
  })

  const proxy = computed(() => {
    return store.config.setup.proxy
  })

  const init = () => {
    form.value.proxyStr = proxy.value?.proxy
    form.value.fastProxy = proxy.value?.fastProxy
    form.value.status = proxy.value?.on || false
  }

  onMounted(() => {
    init()
  })

  const fastSetSubmit = () => {
    const rule = form.value.fastProxy
    proxy.value.fastProxy = rule
    form.value.proxyStr = `export https_proxy=http://${rule} http_proxy=http://${rule} all_proxy=socks5://${rule} HTTPS_PROXY=http://${rule} HTTP_PROXY=http://${rule} ALL_PROXY=socks5://${rule}`
    proxy.value.proxy = form.value.proxyStr
    store.saveConfig()
  }

  const copyProxy = () => {
    clipboard.writeText(form.value.proxyStr ?? '')
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const proxySubmit = () => {
    proxy.value.proxy = form.value.proxyStr
    store.saveConfig()
  }

  const saveStatus = () => {
    proxy.value.on = form.value.status
    store.saveConfig()
  }
</script>

<style lang="scss" scoped>
  .show-content {
    padding-left: 110px;
  }
  :deep(.el-input-group__prepend),
  :deep(.el-input-group__append) {
    padding: 0 8px;
  }
</style>
