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
    <el-button round :icon="ChatLineRound"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, onBeforeUnmount, watch, computed } from 'vue'
  import { ChatLineRound } from '@element-plus/icons-vue'
  import { AIStore } from '@/components/AI/store'
  import { CreateSiteTest } from '@/components/AI/Task/CreateSiteTest'
  import { AIKeys, AIKeysEN } from '@/components/AI/key'
  import { CreateSite } from '@/components/AI/Task/CreateSite'
  import { SiteAccessIssues } from '@/components/AI/Task/SiteAccessIssues'
  import { NginxStartFail } from '@/components/AI/Task/NginxStartFail'
  import { ApacheStartFail } from '@/components/AI/Task/ApacheStartFail'
  import { MysqlStartFail } from '@/components/AI/Task/MysqlStartFail'
  import { MariadbStartFail } from '@/components/AI/Task/MariadbStartFail'
  import { MemcachedStartFail } from '@/components/AI/Task/MemcachedStartFail'
  import { AppStore } from '@/store/app'
  import { I18nT } from '@shared/lang'
  const { cut } = require('nodejieba')

  interface RestaurantItem {
    value: string
  }
  const input = ref()
  const el = ref()
  const content = ref('')
  const aiStore = AIStore()
  const appStore = AppStore()

  const taskRunning = computed(() => {
    return (
      aiStore?.currentTask?.state === 'normal' ||
      aiStore?.currentTask?.state === 'running' ||
      aiStore?.currentTask?.state === 'waitInput'
    )
  })

  const querySearch = (queryString: string, cb: any) => {
    const ALLKeys = appStore.config.setup.lang === 'zh' ? AIKeys : AIKeysEN
    let results: Array<RestaurantItem> = []
    if (queryString) {
      const keys = cut(queryString.toLowerCase(), true)
      results = ALLKeys.filter((a) => {
        return a.tips.flat().some((s) => keys.includes(s))
      }).map((a) => {
        return {
          value: a.txt
        }
      })
    } else {
      if (!taskRunning.value) {
        results = ALLKeys.map((a) => {
          return {
            value: a.txt
          }
        })
      } else {
        results = ALLKeys.filter((a) => a.task === 'StopTask').map((a) => {
          return {
            value: a.txt
          }
        })
      }
    }
    cb(results)
  }

  const checkContent = (v: string) => {
    const ALLKeys = appStore.config.setup.lang === 'zh' ? AIKeys : AIKeysEN
    const find = ALLKeys.find((a) => a.txt === v)
    if (find?.task === 'StopTask' && aiStore?.currentTask) {
      aiStore.currentTask.state = 'failed'
      aiStore.currentTask = undefined
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.任务已终止')
      })
      return
    }
    if (aiStore?.currentTask?.state === 'normal' || aiStore?.currentTask?.state === 'running') {
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.当前有任务正在执行')
      })
      return
    }
    if (aiStore?.currentTask?.state === 'waitInput') {
      aiStore?.currentTask?.next(v)
      return
    }
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
        case 'SiteAccessIssues':
          aiStore.currentTask = new SiteAccessIssues()
          aiStore.currentTask.next()
          break
        case 'StartNginx':
          aiStore.currentTask = new NginxStartFail()
          aiStore.currentTask.next()
          break
        case 'StartApache':
          aiStore.currentTask = new ApacheStartFail()
          aiStore.currentTask.next()
          break
        case 'StartMysql':
          aiStore.currentTask = new MysqlStartFail()
          aiStore.currentTask.next()
          break
        case 'StartMariaDB':
          aiStore.currentTask = new MariadbStartFail()
          aiStore.currentTask.next()
          break
        case 'StartMemcached':
          aiStore.currentTask = new MemcachedStartFail()
          aiStore.currentTask.next()
          break
      }
      return
    }
    aiStore.chatList.push({
      user: 'ai',
      content: I18nT('ai.尚不能执行此任务')
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
