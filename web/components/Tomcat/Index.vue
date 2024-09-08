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
      <Service v-if="current_tab === 0" type-flag="tomcat" title="Tomcat"></Service>
      <Manager v-else-if="current_tab === 1" type-flag="tomcat"></Manager>
      <Config v-if="current_tab === 2" :config="ConfServer"></Config>
      <Config v-if="current_tab === 3" :config="ConfWeb"></Config>
      <Logs v-if="current_tab === 4" type="access"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from '../Base/Config.vue'
  import Logs from '../Base/Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import ConfServer from '../../config/tomcat.server.conf.txt?raw'
  import ConfWeb from '../../config/tomcat.web.conf.txt?raw'

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
        ConfServer,
        ConfWeb,
        current_tab
      }
    },
    computed: {
      tabs() {
        return [
          this.$t('base.service'),
          this.$t('base.versionManager'),
          'server.xml',
          'web.xml',
          this.$t('base.log')
        ]
      }
    },
    watch: {},
    created: function () {},
    methods: {}
  })
</script>
