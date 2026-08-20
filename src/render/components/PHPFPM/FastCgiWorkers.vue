<template>
  <el-dialog
    v-model="show"
    :title="I18nT('php.fastcgiWorkers')"
    width="420px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="dark:bg-[#1d2033]"
    @closed="closedFn"
  >
    <el-form label-position="top">
      <el-form-item :label="I18nT('php.fastcgiWorkerCount')">
        <el-input-number
          v-model="workerCount"
          :min="MIN_FASTCGI_WORKER_COUNT"
          :max="MAX_FASTCGI_WORKER_COUNT"
          :precision="0"
          :step="1"
          controls-position="right"
        />
      </el-form-item>
      <div class="text-xs opacity-60">PHP {{ version.version }}</div>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="saving" @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button :loading="saving" :disabled="saving" type="primary" @click="save">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'

  const MIN_FASTCGI_WORKER_COUNT = 1
  const MAX_FASTCGI_WORKER_COUNT = 64

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    version: ModuleInstalledItem
    workerCount: number
  }>()

  const workerCount = ref<number | undefined>(props.workerCount)
  const saving = ref(false)

  const validWorkerCount = (count: unknown): count is number => {
    return (
      typeof count === 'number' &&
      Number.isInteger(count) &&
      count >= MIN_FASTCGI_WORKER_COUNT &&
      count <= MAX_FASTCGI_WORKER_COUNT
    )
  }

  const restartIfRunning = async () => {
    if (!props.version.run || props.version.running) {
      return
    }
    try {
      await ElMessageBox.confirm(I18nT('php.fastcgiWorkerRestart'), I18nT('base.delAlertTitle'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      })
    } catch {
      return
    }

    try {
      const result = await props.version.restart()
      if (typeof result === 'string') {
        MessageError(result)
      }
    } catch (error) {
      MessageError(`${error}`)
    }
  }

  const save = () => {
    const count = workerCount.value
    if (saving.value) {
      return
    }
    if (!validWorkerCount(count)) {
      MessageError(
        I18nT('php.fastcgiWorkerInvalid', {
          min: MIN_FASTCGI_WORKER_COUNT,
          max: MAX_FASTCGI_WORKER_COUNT
        })
      )
      return
    }

    saving.value = true
    IPC.send(
      'app-fork:php',
      'setFastCgiWorkerCount',
      JSON.parse(JSON.stringify(props.version)),
      count
    ).then(async (key: string, res: any) => {
      IPC.off(key)
      if (res?.code !== 0) {
        MessageError(res?.msg ?? I18nT('base.fail'))
        saving.value = false
        return
      }
      await restartIfRunning()
      saving.value = false
      callback(res.data)
    })
  }

  defineExpose({ show, onSubmit, onClosed })
</script>
