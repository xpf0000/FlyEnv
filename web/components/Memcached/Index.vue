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
      <Service v-if="current_tab === 0" type-flag="memcached" title="Memcached"></Service>
      <Manager v-else-if="current_tab === 1" type-flag="memcached"></Manager>
      <Logs v-if="current_tab === 2"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Logs from '../Base/Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '../../store/app'
  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Service,
      Logs,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab
      }
    },
    computed: {
      tabs() {
        return [this.$t('base.service'), this.$t('base.versionManager'), this.$t('base.log')]
      },
      version() {
        return AppStore().config.server?.memcached?.current?.version
      }
    },
    watch: {},
    created: function () {},
    methods: {}
  })
</script>
