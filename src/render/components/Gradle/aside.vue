<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/gradle' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 3px"
          :svg="import('@/svg/gradle.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Gradle</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('gradle')
</script>
