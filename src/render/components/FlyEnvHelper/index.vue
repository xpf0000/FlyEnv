<template>
  <el-dialog
    v-model="show"
    :title="I18nT('menu.helperInstallTitle')"
    width="600px"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit new-project installing"
    @closed="closedFn"
  >
    <template #default>
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
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, markRaw } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import XTerm from '@/util/XTerm'
  import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
  import IPC from '@/util/IPC'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  FlyEnvHelperSetup.show = true

  const xterm = ref<HTMLElement>()

  const loading = computed({
    get() {
      return FlyEnvHelperSetup.loading
    },
    set(value) {
      FlyEnvHelperSetup.loading = value
    }
  })

  const fetchInstallCommand = (): Promise<string> => {
    return new Promise((resolve) => {
      if (FlyEnvHelperSetup.command) {
        return resolve(FlyEnvHelperSetup.command)
      }
      IPC.send('APP:FlyEnv-Helper-Command').then((key: string, res: any) => {
        IPC.off(key)
        FlyEnvHelperSetup.command = res.command
        resolve(FlyEnvHelperSetup.command)
      })
    })
  }

  const doInstall = async () => {
    if (loading.value) {
      return
    }
    loading.value = true
    const execXTerm = new XTerm()
    const c = await fetchInstallCommand()

    nextTick().then(() => {
      execXTerm.mount(xterm.value!).then(() => {
        execXTerm?.send([c])?.then(() => {
          loading.value = false
        })
      })
    })
    FlyEnvHelperSetup.execXTerm = markRaw(execXTerm)
  }

  onMounted(() => {
    if (loading.value) {
      nextTick().then(() => {
        const execXTerm = FlyEnvHelperSetup.execXTerm
        if (execXTerm && xterm.value) {
          execXTerm.mount(xterm.value)
        }
      })
    } else {
      doInstall()
    }
  })

  onBeforeUnmount(() => {
    const execXTerm = FlyEnvHelperSetup.execXTerm
    execXTerm?.unmounted?.()
    if (!loading.value) {
      execXTerm?.destroy?.()
      delete FlyEnvHelperSetup.execXTerm
    }
    FlyEnvHelperSetup.show = false
  })

  const doEnd = () => {
    FlyEnvHelperSetup.execXTerm?.destroy?.()
    delete FlyEnvHelperSetup.execXTerm
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
