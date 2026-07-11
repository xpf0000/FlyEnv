<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/startup-group' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: startupGroupRunning }">
        <yb-icon
          style="padding: 3px"
          :svg="import('@/svg/switch.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">{{ I18nT('common.startupGroup.title') }}</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { computed, onMounted, watch } from 'vue'

  import { I18nT } from '@lang/index'
  import { AsideSetup } from '@/core/ASide'
  import { StartupGroupManager } from './class/StartupGroupManager'

  const { showItem, currentPage, nav } = AsideSetup('startup-group')
  const groups = computed(() => StartupGroupManager.store.groups)
  const startupGroupRunning = computed(() => StartupGroupManager.isAnyGroupRunning(groups.value))
  const ensureSources = () => StartupGroupManager.ensureSources(groups.value).catch(() => {})

  watch(
    () => groups.value.map((group) => `${group.id}:${group.updatedAt}`).join('|'),
    ensureSources
  )
  onMounted(ensureSources)
</script>
