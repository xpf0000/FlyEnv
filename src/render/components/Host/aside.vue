<template>
    <li v-if="showItem" :class="'non-draggable' + (currentPage === '/hosts' ? ' active' : '')" @click="nav">
        <div class="left">
            <div class="icon-block">
                <yb-icon :svg="import('@/svg/host.svg?raw')" width="30" height="30" />
            </div>
            <span class="title host-title">{{ title }}</span>
        </div>
    </li>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { AsideSetup } from '@/core/ASide'
import { I18nT } from '@shared/lang'

const { showItem, currentPage, nav } = AsideSetup('hosts')
const title = computed(() => {
    return I18nT('base.leftHosts')
})
</script>