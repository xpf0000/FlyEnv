<template>
    <div class="app-float-btn-wapper">
        <ToolFlowButton v-if="showTool" />
        <AI v-if="showAI" />
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { AppStore } from '@/store/app'
import AI from '@/components/AI/index.vue'
import ToolFlowButton from '@/components/Tools/floatButton.vue'

const appStore = AppStore()

const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
})
const showTool = computed(() => {
    return appStore?.config?.setup?.showTool ?? true
})
</script>