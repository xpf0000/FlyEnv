<template>
  <div class="apache-panel main-right-panel">
    <ul class="top-tab">
      <template v-for="(item, index) in tabs" :key="index">
        <li :class="current_tab === index ? 'active' : ''" @click="current_tab = index">{{
          item
        }}</li>
      </template>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" type-flag="apache"></Service>
      <mo-apache-config v-else-if="current_tab === 1"></mo-apache-config>
      <Versions v-else-if="current_tab === 2" type-flag="apache"></Versions>
      <Manager v-else-if="current_tab === 3" type-flag="apache"></Manager>
      <mo-apache-logs v-else-if="current_tab === 4" type="error_log"></mo-apache-logs>
      <mo-apache-logs v-else-if="current_tab === 5" type="access_log"></mo-apache-logs>
    </div>
  </div>
</template>

<script>
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { mapGetters } from 'vuex'
  export default {
    name: 'MoApachePanel',
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
        current_tab: 0,
        tabs: ['服务', '配置修改', '切换版本', '版本管理', '错误日志', '运行日志']
      }
    },
    computed: {
      ...mapGetters('app', {
        server: 'server'
      }),
      version() {
        return this.server?.apache?.current?.version
      }
    },
    watch: {},
    created: function () {
      if (!this.version) {
        this.current_tab = 3
      }
    }
  }
</script>

<style lang="scss">
  .apache-panel {
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
        width: 100px;
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
