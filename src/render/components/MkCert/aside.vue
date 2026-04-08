<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/mkcert' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 2px"
          :svg="import('@/svg/sslmake.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">MkCert</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('mkcert')
</script>
