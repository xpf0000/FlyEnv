<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="{
          active: current_tab === index,
          grouprun: index === 5 && groupRun
        }"
        @click="current_tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" type-flag="mysql" title="Mysql"></Service>
      <Config v-if="current_tab === 1"></Config>
      <Manager v-if="current_tab === 2" url="https://dev.mysql.com/downloads/mysql/" title="Mysql" type-flag="mysql"></Manager>
      <Logs v-if="current_tab === 3" type="error"></Logs>
      <Logs v-if="current_tab === 4" type="slow"></Logs>
      <Group v-if="current_tab === 5"></Group>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import { AppStore } from '@/store/app'
  import Group from './Group/Index.vue'
  import { MysqlStore } from '@/store/mysql'
  import Manager from '../VersionManager/index.vue'

  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Config,
      Service,
      Logs,
      Group,
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
          this.$t('base.slowLog'),
          this.$t('base.group')
        ]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.mysql?.current?.version
      },
      groupRun() {
        return MysqlStore().all.some((a) => a.version.running)
      }
    },
    watch: {},
    created: function () {}
  })
</script>
