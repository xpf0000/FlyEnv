<template>
  <div class="app-float-btn-wapper" :style="{ bottom: AISetup.aiShow ? '75px' : null } as any">
    <ToolFlowButton v-if="showTool" />
    <AI v-if="showAI" />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import AI from '@/components/AI/index.vue'
  import ToolFlowButton from '@/components/Tools/flowButton.vue'
  import { AISetup } from '@/components/AI/setup'

  const appStore = AppStore()

  const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
  })
  const showTool = computed(() => {
    return appStore?.config?.setup?.showTool ?? true
  })
</script>
