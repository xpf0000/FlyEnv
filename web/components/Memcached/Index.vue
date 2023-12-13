<template>
  <div class="memcached-panel main-right-panel">
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
      <Service v-if="current_tab === 0" type-flag="memcached"></Service>
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
        current_tab,
        tabs: [this.$t('base.service'), this.$t('base.versionManager'), this.$t('base.log')]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.memcached?.current?.version
      }
    },
    watch: {},
    created: function () {},
    methods: {}
  })
</script>

<style lang="scss">
  .memcached-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        user-select: none;
        cursor: pointer;
        min-width: 100px;
        padding: 0 12px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      overflow: hidden;
    }
  }
</style>
