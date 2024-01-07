<template>
  <div class="app-ai-btn" @click.stop="showChat">
    <yb-icon :svg="import('@/svg/ai.svg?raw')" width="26" height="26" />
  </div>
  <Chat ref="chat" />
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import Chat from './Chat/index.vue'
  import { AIStore } from '@/components/AI/store'
  import { I18nT } from '@shared/lang'

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
</script>

<style lang="scss">
  .app-ai-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    width: 40px;
    height: 40px;
    right: 20px;
    bottom: 20px;
    border-radius: 44px;
    background: #fff;
    box-shadow: 0 1px 6px 0 #20212447;
    color: #20212447;
    z-index: 9998;
    cursor: pointer;

    &:hover {
      color: #aa88ee;
    }
  }
</style>
