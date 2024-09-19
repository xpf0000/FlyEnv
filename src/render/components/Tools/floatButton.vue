<template>
    <div v-if="!toolShow" class="app-ai-btn tool-btn" @click.stop="show">
        <yb-icon :svg="import('@/svg/tool.svg?raw')" width="26" height="26" />
    </div>
    <el-drawer v-model="toolShow" size="90%" :destroy-on-close="false" :with-header="false" append-to="#container">
        <ToolIndex @on-tool-show="onToolShow" />
    </el-drawer>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import ToolIndex from './Index.vue'

const toolShow = ref(false)
const show = () => {
    toolShow.value = true
}
const onToolShow = () => {
    toolShow.value = false
}
</script>