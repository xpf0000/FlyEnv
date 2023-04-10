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
      <Service v-if="current_tab === 0" type-flag="mariadb"></Service>
      <Config v-if="current_tab === 1"></Config>
      <Versions v-if="current_tab === 2" type-flag="mariadb"></Versions>
      <Manager v-else-if="current_tab === 3" type-flag="mariadb"></Manager>
      <Logs v-if="current_tab === 4" type="error"></Logs>
      <Logs v-if="current_tab === 5" type="slow"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '@/store/app'

  export default defineComponent({
    components: {
      Config,
      Versions,
      Service,
      Logs,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: [
          this.$t('base.service'),
          this.$t('base.configFile'),
          this.$t('base.versionSwitch'),
          this.$t('base.versionManager'),
          this.$t('base.log'),
          this.$t('base.slowLog')
        ]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.mariadb?.current?.version
      }
    },
    watch: {},
    created: function () {
      if (!this.version) {
        this.current_tab = 3
      }
    }
  })
</script>
