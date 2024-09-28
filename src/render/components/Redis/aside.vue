<template>
    <li v-if="showItem" :class="'non-draggable' + (currentPage === '/redis' ? ' active' : '')" @click="nav">
        <div class="left">
            <div class="icon-block" :class="{ run: serviceRunning }">
                <yb-icon style="padding: 7px" :svg="import('@/svg/redis.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Redis</span>
        </div>

        <el-switch v-model="serviceRunning" :disabled="serviceDisabled" @click.stop="stopNav" @change="switchChange">
        </el-switch>
    </li>
</template>

<script lang="ts" setup>
import { AsideSetup, AppServiceModule } from '@/core/ASide'

const {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
} = AsideSetup('redis')

AppServiceModule.redis = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
} as any
</script>