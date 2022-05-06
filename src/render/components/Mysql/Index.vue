<template>
  <div class="mysql-panel main-right-panel">
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

<script>
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'

  export default {
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
        current_tab: 0,
        tabs: ['服务', '配置文件', '切换版本', '版本管理', '系统日志', '慢日志']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>

<style lang="scss">
  .mysql-panel {
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
