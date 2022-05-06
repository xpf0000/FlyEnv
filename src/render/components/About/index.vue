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
          PhpWebStudy 壹佰网络科技
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
        shell.openExternal('https://www.ybyun.wang/')
      }
    }
  }
</script>

<style lang="scss">
  .about-dialog {
    background: #1d2033;

    .el-dialog__title,
    .el-dialog__close {
      color: #fff;
    }
  }

  .about-panel {
    max-width: 632px;

    .app-info {
      position: relative;
      margin: 8px 0;
      padding: 0 20px;
      min-height: 120px;
      .app-version span {
        display: inline-block;
        vertical-align: bottom;
        font-size: $--font-size-large;
        color: #fff;
        line-height: 18px;
      }
      .app-icon {
        position: absolute;
        top: -8px;
        right: 0;
        background: transparent url('../../assets/256x256.png') center center no-repeat;
        background-size: 128px 128px;
        width: 128px;
        height: 128px;
      }
      .engine-info {
        margin: 24px 35% 0 0;
        color: #fff;
      }
    }

    .copyright {
      width: 100%;
      padding: 0 20px;
      font-size: $--font-size-small;
      a {
        color: #fff;
        text-decoration: none;
      }

      .copyright-left {
        text-align: left;
      }
    }
  }
</style>
