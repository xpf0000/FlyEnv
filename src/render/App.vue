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
  import { TourCenter } from '@/core/directive/Tour/index.ts'

  export default {
    name: 'App',
    components: { TitleBar },
    data() {
      return {}
    },
    computed: {
      ...mapGetters('app', {
        password: 'password',
        showTour: 'showTour',
        config: 'config'
      })
    },
    watch: {},
    created() {
      EventBus.on('vue:need-password', this.checkPassword)
      IPC.on('application:about').then(this.showAbout)
      if (!this.showTour) {
        this.checkPassword()
      } else {
        TourCenter.groupShow('custom')
      }
      TourCenter.onHide(() => {
        console.log('TourCenter.onHide !!!!')
        this.config.showTour = false
        this.$store.dispatch('app/saveConfig').then()
        EventBus.emit('TourStep', 8)
      })
    },
    unmounted() {
      EventBus.off('vue:need-password', this.checkPassword)
      IPC.off('application:about')
    },
    mounted() {},
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
