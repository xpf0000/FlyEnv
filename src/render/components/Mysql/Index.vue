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
      <Service v-if="current_tab === 0" type-flag="mysql"></Service>
      <mo-mysql-config v-if="current_tab === 1"></mo-mysql-config>
      <Versions v-if="current_tab === 2" type-flag="mysql"></Versions>
      <Manager v-else-if="current_tab === 3" type-flag="mysql"></Manager>
      <mo-mysql-logs v-if="current_tab === 4" type="error"></mo-mysql-logs>
      <mo-mysql-logs v-if="current_tab === 5" type="slow"></mo-mysql-logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '@/store/app'

  const current_tab = ref(0)

  export default defineComponent({
    name: 'MoMysqlPanel',
    components: {
      [Config.name]: Config,
      Versions,
      Service,
      [Logs.name]: Logs,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab,
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
        return AppStore().config.server?.mysql?.current?.version
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
