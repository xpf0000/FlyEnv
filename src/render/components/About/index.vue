<template>
  <div class="about-panel">
    <div class="app-info">
      <div class="app-version">
        <span>PhpWebStudy</span>
      </div>
      <div class="engine-info">
        <span>Version {{ version }}</span>
      </div>
      <div class="app-icon"></div>
    </div>
    <el-row class="copyright">
      <el-col class="copyright-left">
        <a target="_blank" href="javascript:" rel="noopener noreferrer" @click="toHome($event)">
          PhpWebStudy - https://www.macphpstudy.com
        </a>
      </el-col>
    </el-row>
    <template v-if="lang === 'zh'">
      <el-row style="padding: 0 20px; margin-top: 12px">
        <el-col>
          感谢使用PhpWebStudy. 使用中的任何问题和建议. 都可以加入社群进行讨论. 也可以提交 GitHub
          Issues
        </el-col>
        <el-col style="margin-top: 12px">
          如果PhpWebStudy有帮助到你. 为了项目更好的发展, 烦请star和赞助. 感谢
        </el-col>
        <el-col style="margin-top: 12px">
          GitHub:
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://github.com/xpf0000/PhpWebStudy')"
          >
            https://github.com/xpf0000/PhpWebStudy
          </a>
        </el-col>
        <el-col style="margin-top: 12px">
          赞助:
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://www.macphpstudy.com/sponsor.html')"
          >
            https://www.macphpstudy.com/sponsor.html
          </a>
        </el-col>
      </el-row>
    </template>
    <template v-else>
      <el-row style="padding: 0 20px; margin-top: 12px">
        <el-col>
          Thanks for using PhpWebStudy. If you have any questions or suggestions, you can join the
          community for discussion. You can also submit GitHub Issues
        </el-col>
        <el-col style="margin-top: 12px">
          If PhpWebStudy is helpful to you, please star and sponsor for the project. Thanks
        </el-col>
        <el-col style="margin-top: 12px">
          GitHub:
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://github.com/xpf0000/PhpWebStudy')"
          >
            https://github.com/xpf0000/PhpWebStudy
          </a>
        </el-col>
        <el-col style="margin-top: 12px">
          Sponsor:
          <a
            target="_blank"
            href="javascript:"
            rel="noopener noreferrer"
            @click="openUrl($event, 'https://www.macphpstudy.com/sponsor.html')"
          >
            https://www.macphpstudy.com/sponsor.html
          </a>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script>
  import { AppStore } from '@/store/app.ts'

  const { app, shell } = require('@electron/remote')
  const version = app.getVersion()
  export default {
    name: 'MoTitleBar',
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
      }
    }
  }
</script>
