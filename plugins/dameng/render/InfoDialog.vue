<template>
  <el-dialog v-model="show" :title="DamengT('instanceInfo')" width="560px">
    <div v-loading="state?.busy" class="min-h-24">
      <el-alert v-if="state?.error" type="error" :closable="false" :title="state.error" />
      <el-descriptions v-if="state?.data" :column="1" border>
        <el-descriptions-item :label="DamengT('serverVersion')">{{
          state.data.version || DamengT('unknown')
        }}</el-descriptions-item>
        <el-descriptions-item :label="DamengT('expiry')">{{
          state.data.expiredDate || DamengT('unknown')
        }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="state?.data?.licenseError"
        class="mt-3"
        type="warning"
        :closable="false"
        :title="state.data.licenseError"
      />
    </div>
    <template #footer
      ><el-button @click="show = false">{{ I18nT('base.confirm') }}</el-button></template
    >
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { DamengManager, type DamengInstalled } from './store'
  import { DamengT } from './lang'

  const show = ref(false)
  const target = ref<DamengInstalled>()
  const state = computed(() => (target.value ? DamengManager.info(target.value) : undefined))
  const open = (item: DamengInstalled) => {
    target.value = item
    show.value = true
    DamengManager.getInstanceInfo(item).catch()
  }
  defineExpose({ open })
</script>
