<template>
  <div class="php-panel main-right-panel">
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
      <Service v-if="current_tab === 0" type-flag="php"></Service>
      <mo-php-config v-if="current_tab === 1"></mo-php-config>
      <Versions v-if="current_tab === 2" type-flag="php"></Versions>
      <Manager v-else-if="current_tab === 3" type-flag="php"></Manager>
      <mo-php-logs v-if="current_tab === 4" type="php-fpm"></mo-php-logs>
      <mo-php-logs v-if="current_tab === 5" type="php-fpm-slow"></mo-php-logs>
      <Extends v-if="current_tab === 6"></Extends>
    </div>
  </div>
</template>

<script>
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Extends from './Extends.vue'
  import Manager from '../VersionManager/index.vue'

  export default {
    name: 'MoPhpPanel',
    components: {
      [Config.name]: Config,
      Versions,
      Service,
      [Logs.name]: Logs,
      Extends,
      Manager
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['服务', '配置文件', '切换版本', '版本管理', 'FPM日志', '慢日志', '扩展']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>

<style lang="scss">
  .php-panel {
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
