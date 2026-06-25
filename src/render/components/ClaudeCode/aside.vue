<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/claudeCode' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/claude-code.svg?raw')"
          style="padding: 4px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Claude Code</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const { showItem, currentPage, nav } = AsideSetup()
</script>
