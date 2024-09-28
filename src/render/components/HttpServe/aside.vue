<template>
    <li v-if="showItem" :class="'non-draggable' + (currentPage === '/httpserver' ? ' active' : '')" @click="nav">
        <div class="left">
            <div class="icon-block" :class="{ run: serviceRunning }">
                <yb-icon style="padding: 4.5px" :svg="import('@/svg/http.svg?raw')" width="28" height="28" />
            </div>
            <span class="title">Http Serve</span>
        </div>
    </li>
</template>

<script lang="ts" setup>
import { AsideSetup } from '@/core/ASide'

const { showItem, serviceRunning, currentPage, nav } = AsideSetup('httpserver')
</script>