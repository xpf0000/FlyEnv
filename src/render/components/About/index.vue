<template>
  <el-card>
    <template #header>
      <div class="flex items-baseline gap-3">
        <span class="text-2xl">FlyEnv</span>
        <span>Version {{ version }}</span>
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
      <template v-if="lang === 'zh'">
        <el-row style="padding: 0 20px; margin-top: 30px">
          <el-col>
            感谢使用FlyEnv. 使用中的任何问题和建议. 都可以加入社群进行讨论. 也可以提交 GitHub Issues
          </el-col>
          <el-col style="margin-top: 12px">
            如果FlyEnv有帮助到你. 为了项目更好的发展, 烦请star和赞助. 感谢
          </el-col>
          <el-col style="margin-top: 12px">
            GitHub:
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
            赞助:
            <a
              target="_blank"
              href="javascript:"
              rel="noopener noreferrer"
              @click="openUrl($event, 'https://flyenv.com/sponsor.html')"
            >
              https://flyenv.com/sponsor.html
            </a>
          </el-col>
        </el-row>
      </template>
      <template v-else>
        <el-row style="padding: 0 20px; margin-top: 30px">
          <el-col>
            Thanks for using FlyEnv. If you have any questions or suggestions, you can join the
            community for discussion. You can also submit GitHub Issues
          </el-col>
          <el-col style="margin-top: 12px">
            If FlyEnv is helpful to you, please star and sponsor for the project. Thanks
          </el-col>
          <el-col style="margin-top: 12px">
            GitHub:
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
            Sponsor:
            <a
              target="_blank"
              href="javascript:"
              rel="noopener noreferrer"
              @click="openUrl($event, 'https://flyenv.com/sponsor.html')"
            >
              https://flyenv.com/sponsor.html
            </a>
          </el-col>
        </el-row>
      </template>
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
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { AppStore } from '@/store/app'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { app, shell } from '@/util/NodeFn'
  import IPC from '@/util/IPC'

  const version = ref('')
  const appStore = AppStore()

  const lang = computed(() => appStore.config.setup.lang)

  const openUrl = (e: Event, url: string) => {
    e.preventDefault()
    shell.openExternal(url)
  }

  const toHome = (e: Event) => {
    e.preventDefault()
    shell.openExternal('https://flyenv.com')
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
