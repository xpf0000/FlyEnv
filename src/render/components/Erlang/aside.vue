<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/erlang' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 5px"
          :svg="import('@/svg/erlang-logo.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Erlang</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('erlang')
</script>
