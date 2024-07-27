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
    <el-row>
      <el-col>
        感谢使用PhpWebStudy. 使用中的任何问题和建议. 都可以加入社群进行讨论. 也可以提交 GitHub
        Issues
      </el-col>
      <el-col> 如果PhpWebStudy有帮助到你. 为了项目更好的发展, 烦请star和赞助. 感谢 </el-col>
      <el-col>
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
      <el-col>
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
  </div>
</template>

<script>
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
    computed: {},
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
