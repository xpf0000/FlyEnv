<template>
  <el-drawer
    v-model="currentShow"
    :append-to-body="true"
    size="90%"
    :destroy-on-close="false"
    :with-header="false"
  >
    <div ref="chat" class="app-chat">
      <div class="nav pl-3 pr-5">
        <div class="flex items-center">
          <div class="left" @click="hide">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          </div>
        </div>
        <div class="flex-1 flex items-center px-4">
          <template v-if="currentChat">
            <span
              class="truncate max-w-[320px] cursor-pointer hover:text-yellow-500 mr-4"
              @click.stop="editChat"
              >{{ currentChat.title }}</span
            >
            <PromptVM />
          </template>
        </div>
        <el-button class="flex-shrink-0" @click="doClean">{{ I18nT('base.clean') }}</el-button>
      </div>
      <div class="flex-1 flex h-full overflow-hidden">
        <ASideVM />
        <div class="flex-1 h-full overflow-hidden flex flex-col">
          <template v-if="AISetup.tab === 'flyenv'">
            <Main />
            <Tool ref="toolRef" />
          </template>
          <template v-else>
            <OllamaVM />
          </template>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { AIStore } from '../store'
  import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
  import Tool from './tool.vue'
  import Main from './Main/index.vue'
  import ASideVM from './ASide/index.vue'
  import { AISetup } from '@/components/AI/setup'
  import OllamaVM from './Ollama/index.vue'
  import PromptVM from '../Prompt/index.vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const chat = ref()
  const toolRef = ref()
  const aiStore = AIStore()
  const currentShow = computed({
    get() {
      return AISetup.aiShow
    },
    set(v) {
      AISetup.aiShow = v
    }
  })

  const currentChat = computed(() => {
    return AISetup.modelChatList?.find((f) => f.id === AISetup.tab)
  })

  let EditVM: any
  import('../ChatItemSetup/index.vue').then((res) => {
    EditVM = res.default
  })

  const editChat = () => {
    console.log('editChat !!!!!!')
    AsyncComponentShow(EditVM, {
      item: currentChat.value
    }).then(() => {})
  }

  const show = () => {
    if (currentShow.value) {
      return
    }
    currentShow.value = true
  }

  const hide = () => {
    if (!currentShow.value) {
      return
    }
    currentShow.value = false
  }

  onMounted(() => {})

  onBeforeUnmount(() => {})

  const doClean = () => {
    if (AISetup.tab === 'flyenv') {
      aiStore.chatList.splice(0)
    } else {
      currentChat?.value?.chatList?.splice(0)
      AISetup.save()
    }
  }

  defineExpose({
    show
  })
</script>
