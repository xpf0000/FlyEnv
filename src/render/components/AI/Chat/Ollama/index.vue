<template>
  <el-scrollbar
    ref="scrollbarRef"
    class="flex-1 overflow-hidden bg-[#f0f0f0] dark:bg-[#030712]"
    @scroll="onScroll"
    @end-reached="onScrollEnd"
  >
    <div ref="mainWapper" class="app-ai-chat-main">
      <div class="cell ai">
        <div class="icon">
          <Setting />
        </div>
        <div class="content">
          <ContentVM
            role="prompt"
            class="text"
            :content="currentChat?.prompt?.trim() ?? ''"
            @on-render="onItemRender"
          />
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
              <ContentVM
                :role="item.role"
                class="text"
                :content="item.content.trim()"
                @on-render="onItemRender"
              />
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
      <template v-if="showToBottomBtn">
        <div
          class="z-50 cursor-pointer rounded-full shadow-xl w-10 h-10 left-[50%] ml-[-20px] dark:border-gray-500 dark:bg-slate-600 flex border border-gray-100 border-solid justify-center items-center absolute bottom-5 bg-white text-gray-400 hover:text-yellow-500"
          @click.stop="toBottom"
        >
          <ArrowDownBold class="w-5 h-5" />
        </div>
      </template>
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
    <template v-if="currentChat.streaming">
      <el-button round :icon="VideoPause" @click.stop="doStop"></el-button>
    </template>
    <template v-else>
      <el-tooltip :content="I18nT('ai.enterTips')" placement="top" :teleported="false">
        <el-button round :icon="Promotion" @click.stop="submit"></el-button>
      </el-tooltip>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, type ComputedRef, watch, onMounted, onBeforeUnmount } from 'vue'
  import {
    User,
    Setting,
    Document,
    Picture,
    CopyDocument,
    EditPen,
    Warning,
    Promotion,
    VideoPause,
    ArrowDownBold
  } from '@element-plus/icons-vue'
  import { AISetup, type ChatItem } from '@/components/AI/setup'
  import ContentVM from './content.vue'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { AppStore } from '@/store/app'
  import { dialog, fs, clipboard } from '@/util/NodeFn'
  import { ElScrollbar } from 'element-plus'
  import { debounce } from 'lodash-es'
  import { unUseCopyCode, useCopyCode } from '@/util/markdown/copyCode'

  const mainWapper = ref()
  const appStore = AppStore()

  const speaking = ref<ChatItem | undefined>()

  const textSpeakCancel = () => {
    window.speechSynthesis.cancel()
    speaking.value = undefined
  }

  let isInitiated = false
  let renderTimer: any
  const needScroll = ref(false)
  const showToBottomBtn = ref(false)
  const onItemRender = (role: string, order: 'before' | 'after') => {
    if (isInitiated) {
      if (role === 'user' && order === 'after') {
        bottom.value?.scrollIntoView({
          behavior: 'auto',
          block: 'end'
        })
        needScroll.value = true
      } else if (role === 'assistant' && order === 'after') {
        if (needScroll.value) {
          bottom.value?.scrollIntoView({
            behavior: 'auto',
            block: 'end'
          })
        }
      }
      return
    }
    if (order === 'after') {
      clearTimeout(renderTimer)
      renderTimer = setTimeout(() => {
        isInitiated = true
      }, 500)
      bottom.value?.scrollIntoView({
        behavior: 'auto',
        block: 'end'
      })
    }
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
    utterance.lang = speakLang // Set to Chinese
    utterance.rate = 1 // Speech rate (default value is 1)
    utterance.pitch = 1 // Pitch (default value is 1)
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

  watch(
    chatList,
    () => {
      const scrollContainer = scrollbarRef.value.wrapRef
      if (!scrollContainer) return

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight)
      console.log('distanceToBottom: ', distanceToBottom)
      needScroll.value = distanceToBottom < 60
    },
    { deep: true }
  )

  const scrollbarRef = ref()
  const bottom = ref<HTMLElement>()

  const checkIsNeedShowToBottomBtn = debounce(() => {
    const scrollContainer = scrollbarRef.value.wrapRef
    if (!scrollContainer) return

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight)
    showToBottomBtn.value = distanceToBottom > 360
  }, 300)

  const onScroll = () => {
    checkIsNeedShowToBottomBtn()
  }

  const onScrollEnd = (direction: 'top' | 'bottom' | 'left' | 'right') => {
    console.log('onScrollEnd: ', direction)
  }

  const toBottom = () => {
    bottom.value?.scrollIntoView({
      behavior: 'auto',
      block: 'end'
    })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    console.log('onKeyDown, e: ', e)
    if (AISetup.isComposing) {
      return
    }
    if (e.key === 'Enter') {
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        currentChat?.value?.send()
      } else if (!e.altKey && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        currentChat?.value?.sendNotMake()
      }
    }
  }

  const doStop = () => {
    currentChat?.value?.stopOutput()
  }

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
        const arr = []
        for (const file of filePaths) {
          const info: any = await fs.stat(file)
          if (info.size < 2 * 1024 * 1024) {
            arr.push(file)
          }
        }
        if (arr.length !== filePaths.length) {
          MessageWarning('Some files are larger than 2MB and have been ignored')
        }
        for (const file of arr) {
          try {
            const content = await fs.readFile(file)
            currentChat.value!.content += `\n\`\`\`\n${content}\n\`\`\`\n`
          } catch {
            /* empty */
          }
        }
      })
  }

  onMounted(() => {
    useCopyCode(mainWapper.value)
  })

  onBeforeUnmount(() => {
    unUseCopyCode(mainWapper.value)
  })
</script>
