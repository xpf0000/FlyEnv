<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/mcp' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/mcp.svg?raw')" style="padding: 6px" width="28" height="28" />
      </div>
      <span class="title">MCP Server</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const { showItem, currentPage, nav } = AsideSetup()
</script>
