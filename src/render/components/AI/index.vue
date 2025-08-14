<template>
  <div
    :style="{ display: AISetup.aiShow ? 'none' : null } as any"
    class="app-ai-btn"
    @click.stop="showChat"
  >
    <yb-icon :svg="import('@/svg/ai.svg?raw')" width="26" height="26" />
  </div>
  <Chat ref="chat" />
</template>

<script lang="ts" setup>
  import { ref, onBeforeUnmount } from 'vue'
  import Chat from './Chat/index.vue'
  import { AIStore } from '@/components/AI/store'
  import { I18nT } from '@lang/index'
  import { AISetup } from '@/components/AI/setup'

  const aiStore = AIStore()
  const chat = ref()
  const showChat = () => {
    if (aiStore.chatList.length === 0) {
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.imPipi')
      })
    }
    chat.value.show()
  }
  AISetup.init()
  AISetup.initCompositionEvent()
  onBeforeUnmount(() => {
    AISetup.deinitCompositionEvent()
  })
</script>
