<template>
  <div ref="input" class="app-ai-tool">
    <el-autocomplete
      ref="el"
      v-model="content"
      :trigger-on-focus="true"
      :clearable="true"
      popper-class="app-ai-tool-suggest-popper"
      :fetch-suggestions="querySearch"
      resize="none"
    ></el-autocomplete>
    <el-button round :icon="ChatLineRound" @click.stop="submit"></el-button>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, onBeforeUnmount, computed } from 'vue'
  import { ChatLineRound } from '@element-plus/icons-vue'
  import { AIStore } from '@web/components/AI/store'
  import { CreateSiteTest } from '@web/components/AI/Task/CreateSiteTest'
  import { AIKeys, AIKeysEN } from '@web/components/AI/key'
  import { CreateSite } from '@web/components/AI/Task/CreateSite'
  import { SiteAccessIssues } from '@web/components/AI/Task/SiteAccessIssues'
  import { NginxStartFail } from '@web/components/AI/Task/NginxStartFail'
  import { ApacheStartFail } from '@web/components/AI/Task/ApacheStartFail'
  import { MysqlStartFail } from '@web/components/AI/Task/MysqlStartFail'
  import { MariadbStartFail } from '@web/components/AI/Task/MariadbStartFail'
  import { MemcachedStartFail } from '@web/components/AI/Task/MemcachedStartFail'
  import { AppStore } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import { wordSplit } from '@web/components/AI/Fn/Util'
  import { BrewPHP7Issues } from '@web/components/AI/Task/BrewPHP7Issues'
  import { VersionManagerEmpty } from '@web/components/AI/Task/VersionManagerEmpty'
  import { VersionInstallSlow } from '@web/components/AI/Task/VersionInstallSlow'
  import { MacportInstall } from '@web/components/AI/Task/MacportInstall'
  import { HomebrewInstall } from '@web/components/AI/Task/HomebrewInstall'
  import { MysqlPassword } from '@web/components/AI/Task/MysqlPassword'

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

  const FenciDict: { [k: string]: Array<string> } = {}

  const querySearch = (queryString: string, cb: any) => {
    console.log('querySearch: ', queryString)
    const ALLKeys = appStore.config.setup.lang === 'zh' ? AIKeys : AIKeysEN
    const find = ALLKeys.find((a) => a.txt === queryString.trim())
    if (find) {
      cb([
        {
          value: find.txt
        }
      ])
      return
    }
    let results: Array<RestaurantItem> = []
    if (queryString) {
      const key = queryString.toLowerCase()
      const send = (arr: Array<string>) => {
        results = ALLKeys.filter((a) => {
          return a.tips.flat().some((s) => arr.some((k) => k.includes(s) || s.includes(k)))
        }).map((a) => {
          return {
            value: a.txt
          }
        })
        cb(results)
      }
      if (FenciDict[key]) {
        send(FenciDict[key])
        return
      }
      wordSplit(key).then((keys: Array<string>) => {
        FenciDict[key] = keys
        send(FenciDict[key])
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
      cb(results)
    }
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
        case 'HomebrewPhp7Issues':
          aiStore.currentTask = new BrewPHP7Issues()
          aiStore.currentTask.next()
          break
        case 'VersionManagerEmpty':
          aiStore.currentTask = new VersionManagerEmpty()
          aiStore.currentTask.next()
          break
        case 'VersionInstallSlow':
          aiStore.currentTask = new VersionInstallSlow()
          aiStore.currentTask.next()
          break
        case 'MacportInstall':
          aiStore.currentTask = new MacportInstall()
          aiStore.currentTask.next()
          break
        case 'HomebrewInstall':
          aiStore.currentTask = new HomebrewInstall()
          aiStore.currentTask.next()
          break
        case 'MysqlPassword':
          aiStore.currentTask = new MysqlPassword()
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

  const submit = () => {
    keyEvent({
      key: 'Enter'
    } as any)
  }

  onMounted(() => {
    const dom: HTMLElement = input?.value as any
    const textarea: HTMLTextAreaElement = dom?.querySelector('input') as any
    textarea?.addEventListener('keydown', keyEvent)
  })
  onBeforeUnmount(() => {
    const dom: HTMLElement = input?.value as any
    const textarea: HTMLTextAreaElement = dom?.querySelector('input') as any
    textarea?.removeEventListener('keydown', keyEvent)
  })

  const onShow = () => {
    console.log('onShow !!!')
    el?.value?.focus()
    content.value = ' '
  }

  defineExpose({
    onShow
  })
</script>
