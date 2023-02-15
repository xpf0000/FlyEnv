<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <li class="active" @click="drawer = true">{{ $t('base.add') }}</li>
      <li style="width: auto; padding: 0 15px">
        <span style="margin-right: 10px">hosts: </span>
        <el-switch v-model="hostsSet.write"></el-switch>
      </li>
      <li class="no-hover" style="width: auto; padding: 0 15px">
        <el-button @click="openHosts">{{ $t('base.openHosts') }}</el-button>
      </li>
    </ul>
    <mo-host-list></mo-host-list>
    <el-drawer
      ref="host-edit-drawer"
      v-model="drawer"
      size="460px"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      custom-class="host-edit-drawer"
      :with-header="false"
    >
      <mo-host-edit ref="host-edit"></mo-host-edit>
    </el-drawer>

    <el-drawer v-model="logshow" size="60%" :destroy-on-close="true" :with-header="false">
      <mo-host-logs ref="host-logs"></mo-host-logs>
    </el-drawer>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import Edit from './Edit.vue'
  import List from './List.vue'
  import Logs from './Logs.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  export default defineComponent({
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
    computed: {
      hostsSet() {
        return AppStore().config.setup.hosts
      }
    },
    watch: {
      'hostsSet.write': {
        handler(val) {
          IPC.send('app-fork:host', 'writeHosts', val).then((key: string) => {
            IPC.off(key)
            this.$message.success('操作成功')
          })
          AppStore().saveConfig()
        }
      }
    },
    created: function () {
      EventBus.on('Host-Edit-Close', this.HostEditClose)
      EventBus.on('Host-Edit-Item', this.HostEditItem)
      EventBus.on('Host-Logs-Item', this.HostLogsItem)
    },
    unmounted() {
      EventBus.off('Host-Edit-Close', this.HostEditClose)
      EventBus.off('Host-Edit-Item', this.HostEditItem)
      EventBus.off('Host-Logs-Item', this.HostLogsItem)
    },
    methods: {
      HostLogsItem(data: any) {
        this.logshow = true
        this.$nextTick(() => {
          let ref = this.$refs['host-logs'] as any
          ref.name = data.name
          ref.type = 'nginx-access'
          ref.init()
          ref.initType(ref.type)
        })
      },
      HostEditItem(data: any) {
        this.drawer = true
        this.$nextTick(() => {
          let ref = this.$refs['host-edit'] as any
          let item = Object.assign(ref.item, JSON.parse(JSON.stringify(data)))
          ref.item = item
          ref.edit = JSON.parse(JSON.stringify(item))
          ref.isEdit = true
        })
      },
      HostEditClose() {
        console.log('HostEditClose !!!!!!')
        this.drawer = false
      },
      openHosts() {
        import('./Hosts.vue').then((res) => {
          res.default.show().then()
        })
      }
    }
  })
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
    overflow: hidden;
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
        &.no-hover:hover {
          background: transparent;
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
