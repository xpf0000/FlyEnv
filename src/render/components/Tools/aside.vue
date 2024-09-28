<template>
    <li v-if="showItem" :class="'non-draggable' + (currentPage === '/tools' ? ' active' : '')" @click="nav">
        <div class="left">
            <div class="icon-block">
                <yb-icon :svg="import('@/svg/tool.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">{{ I18nT('base.leftTools') }}</span>
        </div>
    </li>
</template>

<script lang="ts" setup>
import { AsideSetup } from '@/core/ASide'
import { I18nT } from '@shared/lang'

const { showItem, currentPage, nav } = AsideSetup('tools')
</script>