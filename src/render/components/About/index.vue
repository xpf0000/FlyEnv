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
      toHome(e) {
        e.preventDefault()
        shell.openExternal('https://www.macphpstudy.com')
      }
    }
  }
</script>
