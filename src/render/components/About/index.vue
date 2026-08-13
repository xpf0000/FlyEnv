<template>
  <el-card>
    <template #header>
      <div class="flex items-baseline gap-3">
        <span class="text-2xl">FlyEnv</span>
        <span>Version {{ version }}</span>
        <el-button type="primary" size="small" @click.stop="checkUpdate">{{
          I18nT('update.checkForUpdates')
        }}</el-button>
      </div>
    </template>
    <div class="about-panel">
      <div class="app-info">
        <div class="flex justify-center">
          <div class="app-icon" @click.stop="onIconClick"></div>
        </div>
        <div class="mt-5">
          <a target="_blank" href="javascript:" rel="noopener noreferrer" @click="toHome($event)">
            FlyEnv - https://flyenv.com
          </a>
        </div>
      </div>
      <el-row style="padding: 0 20px; margin-top: 30px">
        <el-col>
          {{ $t('feedback.about.thanks') }}
        </el-col>
        <el-col style="margin-top: 12px">
          {{ $t('feedback.about.starSponsor') }}
        </el-col>
        <el-col style="margin-top: 12px">
          {{ $t('feedback.about.github') }}
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://github.com/xpf0000/FlyEnv')"
          >
            https://github.com/xpf0000/FlyEnv
          </a>
        </el-col>
        <el-col style="margin-top: 12px">
          {{ $t('feedback.about.sponsor') }}
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://flyenv.com/license.html')"
          >
            https://flyenv.com/license.html
          </a>
        </el-col>
      </el-row>
      <div style="margin: 20px 20px 0">
        <span style="margin-right: 12px">{{ $t('feedback.anythingToSay') }}</span>
        <el-button type="primary" @click.stop="toFeedback">{{
          $t('feedback.sendMessage')
        }}</el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue'
  import { AppStore } from '@/store/app'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { app, shell } from '@/util/NodeFn'
  import IPC from '@/util/IPC'
  import { I18nT } from '@lang/index'

  const version = ref('')
  const appStore = AppStore()

  const openUrl = (e: Event, url: string) => {
    e.preventDefault()
    shell.openExternal(url)
  }

  const toHome = (e: Event) => {
    e.preventDefault()
    shell.openExternal('https://flyenv.com')
  }

  const checkUpdate = () => {
    appStore.checkUpdate(false)
  }

  const toFeedback = () => {
    import('@/components/Feedback/index.vue').then((res) => {
      AsyncComponentShow(res.default).then()
    })
  }
  let times = 0
  let timer: any
  const onIconClick = () => {
    clearTimeout(timer)
    times += 1
    if (times === 5) {
      times = 0
      IPC.send('application:open-dev-window').then((key) => {
        IPC.off(key)
      })
    }
    timer = setTimeout(() => {
      times = 0
    }, 800)
  }

  onMounted(() => {
    app.getVersion().then((v: string) => {
      version.value = v
    })
  })

  onUnmounted(() => {
    console.log('about unmounted !!!')
  })
</script>
