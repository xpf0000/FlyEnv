<template>
    <li v-if="showItem" :class="'non-draggable' + (currentPage === '/tomcat' ? ' active' : '')" @click="nav">
        <div class="left">
            <div class="icon-block" :class="{ run: serviceRunning }">
                <yb-icon style="padding: 5px" :svg="import('@/svg/Tomcat.svg?raw')" width="30" height="30" />
            </div>
            <span class="title">Tomcat</span>
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
} = AsideSetup('tomcat')

AppServiceModule.tomcat = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
} as any
</script>