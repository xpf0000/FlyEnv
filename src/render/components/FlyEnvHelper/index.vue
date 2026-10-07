<template>
  <el-dialog
    v-model="show"
    :title="I18nT('menu.helperInstallTitle')"
    width="600px"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    class="host-edit new-project installing"
    @closed="closedFn"
  >
    <template #default>
      <p v-if="isLinux" class="mb-3">{{ I18nT('setup.linuxHelperScope') }}</p>
      <div class="main-wapper h-full">
        <div ref="xterm" class="h-full overflow-hidden"> </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button :loading="loading" :disabled="loading" type="primary" @click="doEnd">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const isLinux = window.Server.isLinux

  FlyEnvHelperSetup.show = true

  const xterm = ref<HTMLElement>()

  const loading = computed(() => FlyEnvHelperSetup.loading)

  onMounted(() => {
    nextTick().then(() => {
      if (xterm.value) FlyEnvHelperSetup.mount(xterm.value)
    })
  })

  onBeforeUnmount(() => {
    FlyEnvHelperSetup.detach()
  })

  const doEnd = () => {
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
