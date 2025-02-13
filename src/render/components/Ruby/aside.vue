<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/ruby' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 6px" :svg="import('@/svg/Ruby.svg?raw')" width="29" height="29" />
      </div>
      <span class="title">Ruby</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('ruby')
</script>
