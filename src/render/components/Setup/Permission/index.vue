<template>
  <el-form-item :label="$t('base.permission')" label-position="left" label-width="110">
    <el-space wrap>
      <el-radio-group v-model="confForceStart">
        <el-radio :value="true" @click.native.prevent="clickItem('confForceStart', true)">{{
          $t('base.autoUpdate')
        }}</el-radio>
      </el-radio-group>
      <el-radio-group v-model="confAutoCheck">
        <el-radio :value="true" @click.native.prevent="clickItem('confAutoCheck', true)">{{
          $t('util.forceStart')
        }}</el-radio>
      </el-radio-group>
      <el-radio-group v-model="confShowAIRobot">
        <el-radio :value="true" @click.native.prevent="clickItem('confShowAIRobot', true)">{{
          $t('util.showAIRobot')
        }}</el-radio>
      </el-radio-group>
    </el-space>
  </el-form-item>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { AppStore } from '@/store/app'

  const store = AppStore()

  watch(
    () => [
      store.config.setup.showAIRobot,
      store.config.setup.autoCheck,
      store.config.setup.forceStart
    ],
    () => {
      AppStore().saveConfig()
    },
    { deep: true }
  )

  const confShowAIRobot = computed({
    get: () => store.config.setup.showAIRobot ?? true,
    set: (v) => {
      store.config.setup.showAIRobot = v
    }
  })

  const confAutoCheck = computed({
    get: () => store.config.setup.autoCheck,
    set: (v) => {
      store.config.setup.autoCheck = v
    }
  })

  const confForceStart = computed({
    get: () => store.config.setup.forceStart ?? false,
    set: (v) => {
      store.config.setup.forceStart = v
    }
  })

  const clickItem = (
    type: 'confShowAIRobot' | 'confAutoCheck' | 'confForceStart',
    value: boolean
  ) => {
    const configMap = {
      confShowAIRobot,
      confAutoCheck,
      confForceStart
    }

    const computedProperty = configMap[type] as any
    if (!computedProperty) {
      console.error('Configuration type not found:', type)
      return
    }

    computedProperty.value = value === computedProperty.value ? !computedProperty.value : value
  }
</script>
