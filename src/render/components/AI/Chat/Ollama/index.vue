<template>
  <el-scrollbar class="flex-1 overflow-hidden bg-[#f0f0f0] dark:bg-[#030712]">
    <div class="app-ai-chat-main">
      <div class="cell ai">
        <div class="icon">
          <Setting />
        </div>
        <div class="content">
          <ContentVM class="text" :content="currentChat?.prompt?.trim() ?? ''" />
          <el-button link class="opacity-0">
            <CopyDocument class="w-4 h-4" />
          </el-button>
        </div>
      </div>
      <template v-for="(item, _index) in chatList" :key="_index">
        <div
          class="cell relative"
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
          <div class="content group relative">
            <template v-if="item.images && item.images.length > 0">
              <template v-for="(image, _index) in item.images" :key="_index">
                <el-image :src="image" :preview-src-list="[image]"></el-image>
              </template>
            </template>
            <template v-else>
              <ContentVM class="text" :content="item.content.trim()" />
              <template v-if="item.role === 'assistant'">
                <div class="flex items-center">
                  <span class="pl-1 text-[12px] opacity-60 mr-3">model: {{ item.model }}</span>
                  <template v-if="speaking === item">
                    <el-button type="warning" class="" link @click.stop="textSpeakCancel()">
                      <VideoPause class="w-5 h-5" />
                    </el-button>
                  </template>
                  <template v-else>
                    <el-button
                      class="opacity-0 group-hover:opacity-100"
                      link
                      @click.stop="textSpeakStart(item)"
                    >
                      <yb-icon class="w-5 h-5" :svg="import('@/svg/voice.svg?raw')" />
                    </el-button>
                  </template>
                  <el-button
                    class="opacity-0 group-hover:opacity-100"
                    link
                    @click.stop="copyText(item.content.trim())"
                  >
                    <CopyDocument class="w-4 h-4" />
                  </el-button>
                </div>
              </template>
              <template v-else-if="item.role === 'user'">
                <div class="flex items-center">
                  <el-button
                    link
                    class="opacity-0 group-hover:opacity-100"
                    @click.stop="copyText(item.content.trim())"
                  >
                    <CopyDocument class="w-4 h-4" />
                  </el-button>
                  <el-button
                    link
                    class="opacity-0 group-hover:opacity-100"
                    @click.stop="reEdit(item.content.trim())"
                  >
                    <EditPen class="w-4 h-4" />
                  </el-button>
                </div>
              </template>
            </template>
          </div>
          <template v-if="item.role === 'user'">
            <template v-if="item.error">
              <div class="inline-block pt-[12px] pr-[5px]">
                <el-tooltip :content="item.error" placement="top" :teleported="false">
                  <el-button class="items-start" link type="danger">
                    <Warning class="w-5 h-5" />
                  </el-button>
                </el-tooltip>
              </div>
            </template>
          </template>
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
      resize="none"
      :rows="1"
      :autofocus="true"
      :clearable="true"
      :placeholder="I18nT('ai.enterTips').trim()"
      @keydown.stop="onKeyDown"
    ></el-input>
    <el-tooltip :content="I18nT('ai.docTips')" placement="top" :teleported="false">
      <el-button round :icon="Document" @click.stop="chooseFile"></el-button>
    </el-tooltip>
    <el-tooltip :content="I18nT('ai.picTips')" placement="top" :teleported="false">
      <el-button round :icon="Picture" @click.stop="submitPic"></el-button>
    </el-tooltip>
    <el-tooltip :content="I18nT('ai.enterTips')" placement="top" :teleported="false">
      <el-button round :icon="Promotion" @click.stop="submit"></el-button>
    </el-tooltip>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, ref, nextTick, type ComputedRef } from 'vue'
  import {
    User,
    Setting,
    Document,
    Picture,
    CopyDocument,
    EditPen,
    Warning,
    Promotion,
    VideoPause
  } from '@element-plus/icons-vue'
  import { AISetup, type ChatItem } from '@/components/AI/setup'
  import ContentVM from './content.vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '@/store/app'

  const { dialog, clipboard } = require('@electron/remote')
  const { statSync, readFile } = require('fs-extra')

  const appStore = AppStore()

  const speaking = ref<ChatItem | undefined>()

  const textSpeakCancel = () => {
    window.speechSynthesis.cancel()
    speaking.value = undefined
  }

  const textSpeakStart = (item: ChatItem) => {
    textSpeakCancel()
    const lang = appStore.config.setup.lang
    let speakLang = ''
    if (lang === 'zh') {
      speakLang = 'zh-CN'
    } else {
      speakLang = 'en-US'
    }
    const utterance = new SpeechSynthesisUtterance(item.content.trim())
    utterance.lang = speakLang // 设置为中文
    utterance.rate = 1 // 语速（默认值为 1）
    utterance.pitch = 1 // 音调（默认值为 1)
    utterance.onend = () => {
      speaking.value = undefined
      utterance.onend = null
    }
    window.speechSynthesis.speak(utterance)
    speaking.value = item
  }

  const copyText = (txt: string) => {
    clipboard.writeText(txt)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const currentChat = computed(() => {
    return AISetup.modelChatList.find((f) => f.id === AISetup.tab)
  })

  const chatList: ComputedRef<ChatItem[]> = computed(() => {
    return (
      AISetup.modelChatList
        .find((f) => f.id === AISetup.tab)
        ?.chatList?.filter((f) => f.role !== 'tool' && !f?.tool_calls) ?? []
    )
  })

  const reEdit = (text: string) => {
    currentChat.value!.content = text
  }

  const bottom = ref()

  const onKeyDown = (e: KeyboardEvent) => {
    console.log('onKeyDown, e: ', e)
    if (AISetup.isComposing) {
      return
    }
    if (e.key === 'Enter') {
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault && e.preventDefault()
        e.stopPropagation && e.stopPropagation()
        currentChat?.value?.send()
      } else if (!e.altKey && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault && e.preventDefault()
        e.stopPropagation && e.stopPropagation()
        currentChat?.value?.sendNotMake()
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
