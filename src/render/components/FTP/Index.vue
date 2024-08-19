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
      <Manager v-else-if="current_tab === 1" type-flag="pure-ftpd"></Manager>
      <Config v-if="current_tab === 2"></Config>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from './Service.vue'
  import Config from './Config.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '@/store/app'

  const current_tab = ref(0)

  export default defineComponent({
    name: 'MoRedisPanel',
    components: {
      Config,
      Service,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab,
        tabs: [this.$t('base.service'), this.$t('base.versionManager'), this.$t('base.configFile')]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.redis?.current?.version
      }
    },
    watch: {},
    created: function () {
      if (!this.version) {
        this.current_tab = 1
      }
    }
  })
</script>
