<template>
    <div class="plant-title force-start-plant">
        <span>{{ $t('util.showToolBtn') }}</span>
    </div>
    <div class="main reset-pass">
        <el-switch v-model="value"></el-switch>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { AppStore } from '@/store/app'
const store = AppStore()
const value = computed({
    get() {
        return store?.config?.setup?.showTool ?? true
    },
    set(v) {
        store.config.setup.showTool = v
        store.saveConfig()
    }
})
</script>