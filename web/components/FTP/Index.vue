<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0"></Service>
      <Config v-if="current_tab === 1" :config="conf"></Config>
      <Manager v-else-if="current_tab === 2" type-flag="pure-ftpd"></Manager>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from './Service.vue'
  import Config from '../Base/Config.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '@web/store/app'
  import Conf from '../../config/ftp.conf.txt?raw'

  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Config,
      Service,
      Manager
    },
    props: {},
    data() {
      return {
        conf: Conf,
        current_tab
      }
    },
    computed: {
      tabs() {
        return [this.$t('base.service'), this.$t('base.configFile'), this.$t('base.versionManager')]
      },
      version() {
        return AppStore().config.server?.['pure-ftpd']?.current?.version
      }
    },
    watch: {},
    created: function () {
      if (!this.version) {
        this.current_tab = 2
      }
    }
  })
</script>
