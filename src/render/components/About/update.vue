<template>
  <el-dialog
    v-model="show"
    :title="I18nT('update.checkForUpdates')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <span v-if="appVersion.check > 0">{{ I18nT('update.update-available-message') }}</span>
        <span v-else>{{ I18nT('update.update-not-available-message') }}</span>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="appVersion.check > 0">
          <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
          <el-button type="primary" @click="show = false">{{
            I18nT('update.view-update-log')
          }}</el-button>
          <el-button type="primary" @click="show = false">{{
            I18nT('update.download-new-version')
          }}</el-button>
        </template>
        <template v-else>
          <el-button @click="show = false">{{ I18nT('base.confirm') }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const appStore = AppStore()
  const appVersion = computed(() => {
    return appStore.appVersion
  })
  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
