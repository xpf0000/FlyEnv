<template>
  <div class="app-float-btn-wapper">
    <template v-if="showTool">
      <ToolFlowButton />
    </template>
    <AI v-if="showAI" />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@web/store/app'
  import AI from '@web/components/AI/index.vue'
  import ToolFlowButton from '@web/components/Tools/flowButton.vue'

  const appStore = AppStore()

  const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
  })
  const showTool = computed(() => {
    return appStore?.config?.setup?.showTool ?? true
  })
</script>
