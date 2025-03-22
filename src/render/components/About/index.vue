<template>
  <div class="about-panel">
    <div class="app-info">
      <div class="app-version">
        <span>FlyEnv</span>
      </div>
      <div class="engine-info">
        <span>Version {{ version }}</span>
      </div>
      <div class="app-icon"></div>
      <a
        style="position: absolute; bottom: 0"
        target="_blank"
        href="javascript:"
        rel="noopener noreferrer"
        @click="toHome($event)"
      >
        FlyEnv - https://www.flyenv.com
      </a>
    </div>
    <el-row style="padding: 0 20px; margin-top: 30px">
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
    </el-row>
    <div style="margin: 20px 20px 0">
      <span style="margin-right: 12px">{{ $t('feedback.anythingToSay') }}</span>
      <el-button type="primary" @click.stop="toFeedback">{{
        $t('feedback.sendMessage')
      }}</el-button>
    </div>
  </div>
</template>

<script>
  import { AppStore } from '@/store/app.ts'
  import { AsyncComponentShow } from '@/util/AsyncComponent.ts'

  const { app, shell } = require('@electron/remote')
  const version = app.getVersion()
  export default {
    props: {},
    data() {
      return {
        version
      }
    },
    computed: {
      lang() {
        const app = AppStore()
        return app.config.setup.lang
      }
    },
    methods: {
      openUrl(e, u) {
        e.preventDefault()
        shell.openExternal(u)
      },
      toHome(e) {
        e.preventDefault()
        shell.openExternal('https://www.macphpstudy.com')
      },
      toFeedback() {
        import('@/components/Feedback/index.vue').then((res) => {
          AsyncComponentShow(res.default).then()
        })
      }
    }
  }
</script>
