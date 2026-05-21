<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/cron' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 6px" :svg="import('@/svg/time.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ I18nT('cron.title') }}</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import { I18nT } from '@lang/index'

  const { showItem, currentPage, nav } = AsideSetup('cron')
</script>
