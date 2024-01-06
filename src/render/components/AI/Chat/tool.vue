<template>
  <div ref="input" class="app-ai-tool">
    <el-autocomplete
      ref="el"
      v-model="content"
      :clearable="true"
      popper-class="app-ai-tool-suggest-popper"
      :fetch-suggestions="querySearch"
      :autosize="{ minRows: 1, maxRows: 9 }"
      resize="none"
      type="textarea"
    ></el-autocomplete>
    <el-button round :icon="Folder"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, onBeforeUnmount, watch } from 'vue'
  import { Folder } from '@element-plus/icons-vue'
  import { AIStore } from '@/components/AI/store'
  import { CreateSiteTest } from '@/components/AI/Task/CreateSiteTest'
  import { AIKeys } from '@/components/AI/key'
  import { CreateSite } from '@/components/AI/Task/CreateSite'

  const { cut } = require('nodejieba')

  interface RestaurantItem {
    value: string
  }
  const querySearch = (queryString: string, cb: any) => {
    let results: Array<RestaurantItem> = []
    if (queryString) {
      const keys = cut(queryString.toLowerCase(), true)
      results = AIKeys.filter((a) => {
        return a.tips.flat().some((s) => keys.includes(s))
      }).map((a) => {
        return {
          value: a.txt
        }
      })
    } else {
      results = AIKeys.map((a) => {
        return {
          value: a.txt
        }
      })
    }
    cb(results)
  }

  const input = ref()
  const el = ref()
  const content = ref('')
  const aiStore = AIStore()

  const checkContent = (v: string) => {
    if (aiStore?.currentTask?.state === 'normal' || aiStore?.currentTask?.state === 'running') {
      aiStore.chatList.push({
        user: 'ai',
        content: '当前有任务正在执行，请等待任务执行完毕'
      })
      return
    }
    if (aiStore?.currentTask?.state === 'waitInput') {
      aiStore?.currentTask?.next(v)
      return
    }
    const find = AIKeys.find((a) => a.txt === v)
    if (find) {
      switch (find.task) {
        case 'CreateSiteTest':
          aiStore.currentTask = new CreateSiteTest()
          aiStore.currentTask.next()
          break
        case 'CreateSite':
          aiStore.currentTask = new CreateSite()
          aiStore.currentTask.next()
          break
      }
      return
    }
    aiStore.chatList.push({
      user: 'ai',
      content: '尚不能执行此任务, 请从当前可执行任务中选择'
    })
    return
  }

  const keyEvent = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.altKey || e.ctrlKey || e.metaKey) {
        content.value += '\n'
      } else {
        e?.stopPropagation && e?.stopPropagation()
        e?.preventDefault && e?.preventDefault()
        const value = content.value.trim()
        if (value) {
          aiStore.chatList.push({
            user: 'user',
            content: value
          })
          content.value = ''
          checkContent(value)
        }
      }
    }
  }

  watch(content, (v) => {
    console.log(cut(v, true))
  })

  onMounted(() => {
    const dom: HTMLElement = input?.value as any
    const textarea: HTMLTextAreaElement = dom?.querySelector('textarea') as any
    textarea?.addEventListener('keydown', keyEvent)
  })
  onBeforeUnmount(() => {
    const dom: HTMLElement = input?.value as any
    const textarea: HTMLTextAreaElement = dom?.querySelector('textarea') as any
    textarea?.removeEventListener('keydown', keyEvent)
  })

  const onShow = () => {
    el?.value?.focus()
  }

  defineExpose({
    onShow
  })
</script>

<style lang="scss">
  .app-ai-tool {
    display: flex;
    padding: 12px;
    align-items: flex-end;
    background: #32364a;
    flex-shrink: 0;

    > .el-autocomplete {
      flex: 1;
    }

    > .el-button {
      flex-shrink: 0;
      margin-left: 12px;
    }
  }
  .app-ai-tool-suggest-popper {
    z-index: 999999 !important;
  }
</style>
