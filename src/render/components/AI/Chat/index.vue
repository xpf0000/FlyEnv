<template>
  <div ref="mask" class="app-chat-mask"></div>
  <div ref="chat" class="app-chat">
    <div class="nav">
      <div class="left" @click="hide">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
      </div>
      <el-button @click="doClean">{{ $t('base.clean') }}</el-button>
    </div>
    <Main />
    <Tool ref="toolRef" />
  </div>
</template>

<script lang="ts" setup>
  import { AIStore } from '../store'
  import { ref, onMounted, onBeforeUnmount } from 'vue'
  import Tool from './tool.vue'
  import Main from './Main/index.vue'

  const action = ref('')
  const mask = ref()
  const chat = ref()
  const toolRef = ref()
  const aiStore = AIStore()
  const currentShow = ref(false)

  const show = () => {
    if (currentShow.value) {
      return
    }
    currentShow.value = true
    action.value = 'show'

    const dom: HTMLElement = chat.value as any
    dom.classList.remove('show', 'init')
    dom.classList.add('show', 'init')

    const maskDom: HTMLElement = mask.value as any
    maskDom.classList.remove('show', 'init')
    maskDom.classList.add('show', 'init')
    setTimeout(() => {
      dom.classList.remove('init')
      maskDom.classList.remove('init')
    }, 50)
  }

  const hide = () => {
    if (!currentShow.value) {
      return
    }
    action.value = 'hide'
    const dom: HTMLElement = chat.value as any
    const maskDom: HTMLElement = mask.value as any
    if (dom.classList.contains('show')) {
      dom.classList.add('init')
    }
    if (maskDom.classList.contains('show')) {
      maskDom.classList.add('init')
    }
  }

  const onAnimoEnd = (e: Event) => {
    e?.stopPropagation && e?.stopPropagation()
    e?.preventDefault && e?.preventDefault()
    if (e.target !== chat.value) {
      return
    }
    if (action.value === 'hide') {
      const dom: HTMLElement = chat.value as any
      const maskDom: HTMLElement = mask.value as any
      dom.classList.remove('show', 'init')
      maskDom.classList.remove('show', 'init')
      currentShow.value = false
    } else {
      toolRef?.value?.onShow?.()
    }
    action.value = ''
  }

  onMounted(() => {
    const dom: HTMLElement = chat.value as any
    dom.addEventListener('webkittransitionend', onAnimoEnd)
    dom.addEventListener('webkitanimationend', onAnimoEnd)
    dom.addEventListener('transitionend', onAnimoEnd)
    dom.addEventListener('animationend', onAnimoEnd)
  })

  onBeforeUnmount(() => {
    const dom: HTMLElement = chat.value as any
    dom.removeEventListener('webkittransitionend', onAnimoEnd)
    dom.removeEventListener('webkitanimationend', onAnimoEnd)
    dom.removeEventListener('transitionend', onAnimoEnd)
    dom.removeEventListener('animationend', onAnimoEnd)
  })

  const doClean = () => {
    aiStore.chatList.splice(0)
  }

  defineExpose({
    show
  })
</script>
