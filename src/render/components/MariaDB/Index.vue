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
      <Service v-if="current_tab === 0" type-flag="mariadb" title="MariaDB"></Service>
      <Config v-else-if="current_tab === 1"></Config>
      <Manager v-else-if="current_tab === 2" url="https://mariadb.com/downloads/" title="Mariadb" type-flag="mariadb"></Manager>
      <Logs v-else-if="current_tab === 3" type="error"></Logs>
      <Logs v-else-if="current_tab === 4" type="slow"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import { AppStore } from '@/store/app'
  import Manager from '../VersionManager/index.vue'

  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Config,
      Service,
      Logs,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab,
        tabs: [
          this.$t('base.service'),
          this.$t('base.configFile'),
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
    created: function () {}
  })
</script>
