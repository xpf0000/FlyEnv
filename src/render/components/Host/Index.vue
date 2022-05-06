<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <li class="active" @click="drawer = true">添加</li>
    </ul>
    <mo-host-list></mo-host-list>
    <el-drawer
      ref="host-edit-drawer"
      v-model="drawer"
      size="460px"
      title="我是标题"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      custom-class="host-edit-drawer"
      :with-header="false"
    >
      <mo-host-edit ref="host-edit"></mo-host-edit>
    </el-drawer>

    <el-drawer
      v-model="logshow"
      size="60%"
      title="我是标题"
      :destroy-on-close="true"
      :with-header="false"
    >
      <mo-host-logs ref="host-logs"></mo-host-logs>
    </el-drawer>
  </div>
</template>

<script>
  import Edit from './Edit.vue'
  import List from './List.vue'
  import Logs from './Logs.vue'
  export default {
    name: 'MoHostPanel',
    components: {
      [Edit.name]: Edit,
      [List.name]: List,
      [Logs.name]: Logs
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['添加'],
        drawer: false,
        logshow: false
      }
    },
    computed: {},
    watch: {},
    created: function () {
      this.$baseEventBus.on('Host-Edit-Close', this.HostEditClose)
      this.$baseEventBus.on('Host-Edit-Item', this.HostEditItem)
      this.$baseEventBus.on('Host-Logs-Item', this.HostLogsItem)
    },
    unmounted() {
      this.$baseEventBus.off('Host-Edit-Close', this.HostEditClose)
      this.$baseEventBus.off('Host-Edit-Item', this.HostEditItem)
      this.$baseEventBus.off('Host-Logs-Item', this.HostLogsItem)
    },
    methods: {
      HostLogsItem(data) {
        this.logshow = true
        this.$nextTick(() => {
          let ref = this.$refs['host-logs']
          ref.name = data.name
          ref.type = 'nginx-access'
          ref.init()
          ref.initType(ref.type)
        })
      },
      HostEditItem(data) {
        this.drawer = true
        this.$nextTick(() => {
          let ref = this.$refs['host-edit']
          let item = Object.assign(ref.item, JSON.parse(JSON.stringify(data)))
          ref.item = item
          ref.edit = JSON.parse(JSON.stringify(item))
          ref.isEdit = true
        })
      },
      HostEditClose() {
        console.log('HostEditClose !!!!!!')
        this.drawer = false
      }
    }
  }
</script>

<style lang="scss">
  .el-drawer {
    outline: none;
    .el-drawer__body {
      height: 100%;
    }
  }
  .host-edit-drawer {
    z-index: 5050 !important;
  }
  .host-panel {
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
