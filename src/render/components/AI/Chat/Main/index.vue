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

<style lang="scss">
  .app-ai-chat-main {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    width: 100%;
    background: #f0f0f0;
    padding: 12px;
    font-size: 16px;

    > .cell {
      display: flex;
      margin-bottom: 15px;

      > .icon {
        border-radius: 30px;
        margin-top: 4px;
        width: 38px;
        height: 38px;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          width: 22px;
          height: 22px;
        }
      }
      > .content {
        max-width: 75%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;

        > .text {
          color: #303133;
          padding: 10px;
          line-height: 1.6;
          border-radius: 5px;
          word-wrap: break-word;
          white-space: pre-wrap;
          user-select: text;
        }
      }
      &.ai {
        > .icon {
          color: #aa88ee;
          margin-right: 10px;
        }
        > .content {
          > .text {
            background: #fff;
          }
        }
      }
      &.user {
        flex-direction: row-reverse;
        justify-content: end;

        > .icon {
          color: #409eff;
          margin-left: 10px;
        }
        > .content {
          > .text {
            background: #1aad19;
          }
        }
      }
    }

    > .bottom {
      height: 1px;
    }
  }
</style>
