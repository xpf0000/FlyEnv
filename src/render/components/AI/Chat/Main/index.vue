<template>
  <div class="app-ai-chat-main">
    <template v-for="(item, index) in chatList" :key="index">
      <div class="cell" :class="{ [item.user]: true }">
        <div class="icon">
          <template v-if="item.user === 'ai'">
            <yb-icon class="ai" :svg="import('@/svg/ai.svg?raw')" />
          </template>
          <template v-else>
            <User />
          </template>
        </div>
        <div class="content">
          <div class="text" v-html="item.content"> </div>
          <template v-if="item?.action === 'ChooseSiteRoot'">
            <ChooseSiteRoot :item="item" />
          </template>
          <template v-else-if="item?.action === 'SiteAccessIssues'">
            <SiteAccessIssues />
          </template>
        </div>
      </div>
    </template>
    <div ref="bottom" class="bottom"></div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref, nextTick } from 'vue'
  import { AIStore } from '@/components/AI/store'
  import { User } from '@element-plus/icons-vue'
  import ChooseSiteRoot from './Plant/chooseSiteRoot.vue'
  import SiteAccessIssues from './Plant/siteAccessIssues.vue'

  const { shell } = require('@electron/remote')
  const openDir = (dir: string) => {
    shell.openPath(dir)
  }
  const openUrl = (url: string) => {
    shell.openExternal(url)
  }

  window.openDir = openDir
  window.openUrl = openUrl

  const bottom = ref()
  const aiStore = AIStore()
  const chatList = computed(() => {
    return aiStore.chatList
  })
  watch(
    chatList,
    () => {
      nextTick().then(() => {
        const dom: HTMLElement = bottom?.value as any
        dom?.scrollIntoView({
          behavior: 'smooth',
          block: 'end'
        })
      })
    },
    {
      deep: true
    }
  )
</script>
