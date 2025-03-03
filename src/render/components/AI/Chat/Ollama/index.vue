<template>
  <el-scrollbar class="flex-1 overflow-hidden bg-[#f0f0f0] dark:bg-[#030712]">
    <div class="app-ai-chat-main">
      <template v-for="(item, _index) in chatList" :key="_index">
        <div
          class="cell"
          :class="{ user: item.role === 'user', ai: ['assistant', 'system'].includes(item.role) }"
        >
          <div class="icon">
            <template v-if="item.role === 'assistant'">
              <yb-icon class="ai" :svg="import('@/svg/ai.svg?raw')" />
            </template>
            <template v-else-if="item.role === 'system'">
              <Setting />
            </template>
            <template v-else>
              <User />
            </template>
          </div>
          <div class="content">
            <ContentVM class="text" :content="item.content.trim()" />
          </div>
        </div>
      </template>
      <div ref="bottom" class="bottom"></div>
    </div>
  </el-scrollbar>
  <div v-if="currentChat" ref="input" class="app-ai-tool">
    <el-input
      v-model="currentChat.content"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 8 }"
      :autofocus="true"
      :clearable="true"
      @keydown.stop="onKeyDown"
    ></el-input>
    <el-button round :icon="ChatLineRound" @click.stop="submit"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref, nextTick, type ComputedRef } from 'vue'
  import { ChatLineRound, User, Setting } from '@element-plus/icons-vue'
  import { AISetup, type ChatItem } from '@/components/AI/setup'
  import type { AIOllama } from '@/components/AI/AIOllama'
  import ContentVM from './content.vue'

  const currentChat: ComputedRef<AIOllama | undefined> = computed(() => {
    return AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)
  })

  const chatList: ComputedRef<ChatItem[]> = computed(() => {
    return AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)?.chatList ?? []
  })

  const bottom = ref()

  const onKeyDown = (e: KeyboardEvent) => {
    console.log('onKeyDown, e: ', e)
    if (e.key === 'Enter') {
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault && e.preventDefault()
        e.stopPropagation && e.stopPropagation()
        currentChat?.value?.send()
      }
    }
  }

  watch(
    chatList,
    () => {
      nextTick().then(() => {
        const dom: HTMLElement = bottom?.value as any
        dom?.scrollIntoView({
          behavior: 'auto',
          block: 'end'
        })
      })
    },
    {
      deep: true
    }
  )

  const submit = () => {
    currentChat?.value?.send()
  }
</script>
