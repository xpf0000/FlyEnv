<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/cloudflared' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 2px"
          :svg="import('@/svg/cloudflare.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Cloudflared</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('cloudflared')
</script>
