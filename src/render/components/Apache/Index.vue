<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <template v-for="(item, index) in tabs" :key="index">
        <li :class="current_tab === index ? 'active' : ''" @click="current_tab = index">{{
          item
        }}</li>
      </template>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" type-flag="apache"></Service>
      <Config v-else-if="current_tab === 1"></Config>
      <Manager v-else-if="current_tab === 2" type-flag="apache"></Manager>
      <Logs v-else-if="current_tab === 3" type="error_log"></Logs>
      <Logs v-else-if="current_tab === 4" type="access_log"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '@/store/app'

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
          this.$t('base.errorLog'),
          this.$t('base.log')
        ]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.apache?.current?.version
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
