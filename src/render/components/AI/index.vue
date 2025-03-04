<template>
  <div class="app-ai-btn" @click.stop="showChat">
    <yb-icon :svg="import('@/svg/ai.svg?raw')" width="26" height="26" />
  </div>
  <Chat ref="chat" />
</template>

<script lang="ts" setup>
  import { ref, onBeforeUnmount } from 'vue'
  import Chat from './Chat/index.vue'
  import { AIStore } from '@/components/AI/store'
  import { I18nT } from '@shared/lang'
  import { createMarkdownRenderer, disposeMdItInstance } from '@/util/markdown/markdown'
  import { AISetup } from '@/components/AI/setup'

  const aiStore = AIStore()
  const chat = ref()
  const showChat = () => {
    if (aiStore.chatList.length === 0) {
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.我是pipi')
      })
    }
    chat.value.show()
  }
  createMarkdownRenderer().then().catch()
  AISetup.init()
  onBeforeUnmount(() => {
    disposeMdItInstance()
  })
</script>
