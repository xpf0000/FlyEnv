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
      <Service v-if="current_tab === 0" type-flag="nginx" title="Nginx"></Service>
      <Config v-if="current_tab === 1"></Config>
      <Manager v-if="current_tab === 2" url="https://nginx.org/en/download.html" title="Nginx" type-flag="nginx"></Manager>
      <Logs v-if="current_tab === 3" type="error"></Logs>
      <Logs v-if="current_tab === 4" type="access"></Logs>
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
          this.$t('base.errorLog'),
          this.$t('base.log')
        ]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.nginx?.current?.version
      }
    },
    watch: {},
    created: function () {},
    methods: {}
  })
</script>
