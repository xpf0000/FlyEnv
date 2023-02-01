<template>
  <TitleBar />
  <router-view />
</template>

<script>
  import TitleBar from './components/Native/TitleBar.vue'
  import { mapGetters } from 'vuex'
  import { EventBus } from './global.js'
  import { passwordCheck } from '@/util/Brew.js'
  import IPC from '@/util/IPC.js'

  export default {
    name: 'App',
    components: { TitleBar },
    data() {
      return {}
    },
    computed: {
      ...mapGetters('app', {
        password: 'password',
        config: 'config',
        server: 'server'
      })
    },
    watch: {
      server: {
        handler(v) {
          console.log('APP watch server: ', v)
        },
        deep: true
      }
    },
    created() {
      EventBus.on('vue:need-password', this.checkPassword)
      IPC.on('application:about').then(this.showAbout)
      this.checkPassword()
    },
    unmounted() {
      EventBus.off('vue:need-password', this.checkPassword)
      IPC.off('application:about')
    },
    mounted() {
      console.log('App mounted server: ', this.server)
    },
    methods: {
      showAbout() {
        this.$baseDialog(import('./components/About/index.vue'))
          .className('about-dialog')
          .title('关于我们')
          .noFooter()
          .then()
          .show()
      },
      checkPassword() {
        passwordCheck().then(() => {})
      }
    }
  }
</script>

<style lang="scss">
  html,
  body,
  #app {
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
  }

  .el-drawer {
    background: #1d2033 !important;
    background-color: #1d2033 !important;

    .el-drawer__body {
      background: #1d2033 !important;
      padding: 0 !important;
    }
  }
</style>
