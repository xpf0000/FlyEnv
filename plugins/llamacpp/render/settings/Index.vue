<template>
  <div class="module-config"
    ><el-card class="h-full"
      ><template #header
        ><el-radio-group :model-value="section" @change="change"
          ><el-radio-button value="service">{{ t('serviceSettings') }}</el-radio-button
          ><el-radio-button value="model">{{ t('modelSettings') }}</el-radio-button></el-radio-group
        ></template
      ><ServiceSettings v-if="section === 'service'" ref="serviceRef" /><ModelSettings
        v-else
        ref="modelRef"
        :initial-model-key="initialModelKey"
        :initial-projector-key="initialProjectorKey"
        @open-repository="$emit('openRepository', $event)" /></el-card
  ></div>
</template>
<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import { LlamaCppT as t } from '../lang'
  import ServiceSettings from './ServiceSettings.vue'
  import ModelSettings from './ModelSettings.vue'
  defineEmits(['openRepository'])
  const props = defineProps<{ initialModelKey?: string; initialProjectorKey?: string }>()
  const section = ref(props.initialModelKey ? 'model' : 'service'),
    serviceRef = ref(),
    modelRef = ref()
  const canLeave = async () =>
    (await (section.value === 'model' ? modelRef.value : serviceRef.value)?.canLeave()) ?? true
  const change = async (value: string) => {
    if (await canLeave()) section.value = value
  }
  watch(
    () => props.initialModelKey,
    async (v) => {
      if (v) await change('model')
    }
  )
  const openModel = async () => {
    if (await canLeave()) section.value = 'model'
  }
  defineExpose({ canLeave, openModel })
</script>
