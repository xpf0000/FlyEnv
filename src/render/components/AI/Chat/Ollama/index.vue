<template>
  <el-scrollbar class="flex-1 overflow-hidden bg-[#f0f0f0] dark:bg-[#030712]">
    <div class="app-ai-chat-main">
      {{ chatList }}
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
            <div class="text" v-html="item.content"> </div>
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
    ></el-input>
    <el-button round :icon="ChatLineRound" @click.stop="submit"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref, nextTick, type ComputedRef } from 'vue'
  import { ChatLineRound, User, Setting } from '@element-plus/icons-vue'
  import { AISetup, type ChatItem } from '@/components/AI/setup'
  import type { AIOllama } from '@/components/AI/AIOllama'

  const currentChat: ComputedRef<AIOllama | undefined> = computed(() => {
    return AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)
  })

  const chatList: ComputedRef<ChatItem[]> = computed(() => {
    return AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)?.chatList ?? []
  })

  const bottom = ref()

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

  const submit = () => {
    currentChat?.value?.send()
  }
</script>
