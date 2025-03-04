<template>
  <el-scrollbar class="flex-1 overflow-hidden bg-[#f0f0f0] dark:bg-[#030712]">
    <div class="app-ai-chat-main">
      <div class="cell ai">
        <div class="icon">
          <Setting />
        </div>
        <div class="content">
          <ContentVM class="text" :content="currentChat?.prompt?.trim() ?? ''" />
        </div>
      </div>
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
    <el-button round :icon="Document" @click.stop="chooseFile"></el-button>
    <el-button round :icon="Picture" @click.stop="submitPic"></el-button>
    <el-button round :icon="ChatLineRound" @click.stop="submit"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref, nextTick, type ComputedRef } from 'vue'
  import { ChatLineRound, User, Setting, Document, Picture } from '@element-plus/icons-vue'
  import { AISetup, type ChatItem } from '@/components/AI/setup'
  import type { AIOllama } from '@/components/AI/AIOllama'
  import ContentVM from './content.vue'
  import { MessageWarning } from '@/util/Element'

  const { dialog } = require('@electron/remote')
  const { statSync, readFile } = require('fs-extra')

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

  const submitPic = () => {
    currentChat?.value?.sendImage()
  }

  const chooseFile = () => {
    dialog
      .showOpenDialog({
        properties: ['multiSelections', 'showHiddenFiles', 'openFile']
      })
      .then(async ({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const arr = filePaths.filter((f: string) => {
          const info = statSync(f)
          return info.size < 2 * 1024 * 1024
        })
        if (arr.length !== filePaths.length) {
          MessageWarning('有些文件大于2M, 已忽略')
        }
        for (const file of arr) {
          try {
            const content = await readFile(file, 'utf-8')
            currentChat.value!.content += `\n${content}`
          } catch (e) {}
        }
      })
  }
</script>
