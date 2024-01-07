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
    <Tool ref="tool" />
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
  const tool = ref()
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
    console.log('onAnimoEnd !!!', e.target)
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
      tool.value.onShow()
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

<style lang="scss">
  .app-chat-mask {
    position: fixed;
    inset: 0;
    z-index: 9997;
    background: rgba(0, 0, 0, 0.5);
    transition: opacity 0.4s;

    &:not(.show) {
      display: none;
    }

    &.show {
      opacity: 1;

      &.init {
        opacity: 0;
      }
    }
  }
  .app-chat {
    position: fixed;
    z-index: 9999;
    //background: #1d2033;
    background: #f0f0f0;
    display: none;
    flex-direction: column;
    transition: all 0.4s;
    overflow: hidden;

    &.show {
      display: flex;
      &:not(.init) {
        left: 280px;
        top: 0;
        right: 0;
        bottom: 0;
        border-radius: 0;
        width: calc(100vw - 280px);
        height: 100vh;
        opacity: 1;
      }
      &.init {
        display: flex;
        left: calc(100vw - 40px - 20px);
        top: calc(100vh - 40px - 20px);
        width: 40px;
        height: 40px;
        right: 20px;
        bottom: 20px;
        border-radius: 44px;
        opacity: 0.5;
      }
    }

    &:not(.show) {
      display: none;
    }

    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }

    > .main {
      flex: 1;
      overflow: auto;
    }
  }
</style>
