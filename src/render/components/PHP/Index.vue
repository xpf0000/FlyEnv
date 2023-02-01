<template>
  <div class="php-panel main-right-panel">
    <ul class="top-tab">
      <li :class="current_tab === 0 ? 'active' : ''" @click="current_tab = 0"
        >{{ tabs[0] }}
        <yb-icon
          :svg="import('@/svg/icon_refresh.svg?raw')"
          width="18"
          height="18"
          @click.stop="refreshVersions"
        />
      </li>
      <li :class="current_tab === 3 ? 'active' : ''" @click="current_tab = 3">{{ tabs[3] }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" ref="service" type-flag="php"></Service>
      <Manager v-else-if="current_tab === 3" type-flag="php"></Manager>
    </div>
  </div>
</template>

<script>
  import Service from './List.vue'
  import Manager from '../VersionManager/index.vue'

  export default {
    name: 'MoPhpPanel',
    components: {
      Service,
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
    unmounted() {},
    methods: {
      refreshVersions() {
        this.$refs.service?.reinit()
      }
    }
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
          > svg {
            display: block;
          }
        }

        > svg {
          margin-left: 8px;
          cursor: pointer;
          display: none;

          &:hover {
            color: #409eff;
          }
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
