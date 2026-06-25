<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/openCode' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/opencode.svg?raw')"
          style="padding: 0"
          width="28"
          height="28"
        />
      </div>
      <span class="title">OpenCode</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const { showItem, currentPage, nav } = AsideSetup()
</script>
