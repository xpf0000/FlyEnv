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
      <Config v-if="current_tab === 1" :config="conf"></Config>
      <Manager v-else-if="current_tab === 2" type-flag="mysql"></Manager>
      <Logs v-if="current_tab === 3" type="error"></Logs>
      <Logs v-if="current_tab === 4" type="slow"></Logs>
      <Group v-if="current_tab === 5"></Group>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from '../Base/Config.vue'
  import Logs from '../Base/Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '../../store/app'
  import Conf from '../../config/mysql.conf.txt?raw'
  import Group from './Group/Index.vue'

  const current_tab = ref(0)

  export default defineComponent({
    name: 'MoMysqlPanel',
    components: {
      Config,
      Service,
      Logs,
      Manager,
      Group
    },
    props: {},
    data() {
      return {
        conf: Conf,
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
      }
    }
  })
</script>
