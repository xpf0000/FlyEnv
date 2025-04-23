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
        FlyEnv - https://flyenv.com
      </a>
    </div>
    <template v-if="lang === 'zh'">
      <el-row style="padding: 0 20px; margin-top: 30px">
        <el-col>
          Thank you for using FlyEnv. If you encounter any issues or have suggestions while using it, feel free to join the community for discussion. You can also submit GitHub Issues.
        </el-col>
        <el-col style="margin-top: 12px">
          If FlyEnv has been helpful to you, for the better development of the project, please consider starring and sponsoring it. Thank you.
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
    <template v-else>
      <el-row style="padding: 0 20px; margin-top: 30px">
        <el-col>
          Thanks for using FlyEnv. If you have any questions or suggestions, you can join the
          community for discussion. You can also submit GitHub Issues.
        </el-col>
        <el-col style="margin-top: 12px">
          If FlyEnv is helpful to you, please star and sponsor for the project. Thanks.
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
</template>

<script>
  import { AppStore } from '@web/store/app.ts'
  import { AsyncComponentShow } from '@web/fn'

  export default {
    name: 'MoTitleBar',
    props: {},
    data() {
      return {
        version: '4.5.1'
      }
    },
    computed: {
      lang() {
        const app = AppStore()
        return app.config.setup.lang
      }
    },
    unmounted() {
      console.log('about unmounted !!!')
    },
    methods: {
      openUrl(e) {
        e.preventDefault()
      },
      toHome(e) {
        e.preventDefault()
      },
      toFeedback() {
        import('@web/components/Feedback/index.vue').then((res) => {
          AsyncComponentShow(res.default).then()
        })
      }
    }
  }
</script>
