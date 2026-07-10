<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/startup-group' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/switch.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ I18nT('common.startupGroup.title') }}</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('startup-group')
</script>
