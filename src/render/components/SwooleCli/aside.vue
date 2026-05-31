<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/swoole-cli' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/swoole-cli.svg?raw')"
          style="padding: 1px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Swoole CLI</span>
    </div>
    <LanguageProjectASide type-flag="swoole-cli" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('swoole-cli')
</script>
