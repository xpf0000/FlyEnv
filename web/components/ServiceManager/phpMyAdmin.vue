<template>
  <el-dialog
    v-model="show"
    title="phpMyAdmin"
    width="500px"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <div class="main-wapper">
      <template v-if="!phpMyAdminStore.fetching">
        <span>{{ I18nT('host.phpMyAdminInstallTips') }}</span>
      </template>
      <template v-else>
        <div style="display: flex; align-items: center; justify-content: center; padding: 15px">
          <el-progress type="circle" :percentage="phpMyAdminStore.percent" :status="state" />
        </div>
      </template>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="!phpMyAdminStore.fetching">
          <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
          <el-button type="primary" @click="doRun">{{ I18nT('base.confirm') }}</el-button>
        </template>
        <template v-else>
          <el-button
            type="primary"
            :disabled="phpMyAdminStore.percent < 100"
            :loading="phpMyAdminStore.percent < 100"
            @click="doSubmit"
            >{{ I18nT('base.confirm') }}</el-button
          >
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { nextTick, ref } from 'vue'
  import { AsyncComponentSetup } from '@web/fn'
  import { PhpMyAdminTask } from '@web/components/ServiceManager/service'
  import { I18nT } from '@shared/lang'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const phpMyAdminStore = PhpMyAdminTask

  const state = ref('')

  const doRun = () => {
    if (PhpMyAdminTask.fetching) {
      return
    }
    PhpMyAdminTask.fetching = true
    let p = 0
    const run = () => {
      p += 1
      PhpMyAdminTask.percent = p
      if (p === 100) {
        PhpMyAdminTask.percent = 100
        state.value = 'success'
        return
      }
      requestAnimationFrame(run)
    }
    requestAnimationFrame(run)
  }

  const doSubmit = () => {
    show.value = false
    callback(true)
    nextTick().then(() => {
      PhpMyAdminTask.fetching = false
      PhpMyAdminTask.percent = 0
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
