<template>
  <ul class="host-list">
    <li
      v-for="(item, index) in hosts"
      :key="index"
      :class="'host-item' + (current_row === index ? ' active' : '')"
      @click="current_row = index"
    >
      <div class="left">
        <div class="icon-block">
          <yb-icon :svg="import('@/svg/link.svg?raw')" width="22" height="22" />
        </div>
        <div class="info">
          <span class="name" v-text="item.name"> </span>
          <span class="url" v-text="item.url"> </span>
        </div>
      </div>

      <el-popover
        :ref="'host-list-poper-' + index"
        effect="dark"
        popper-class="host-list-poper"
        placement="bottom-end"
        width="150"
      >
        <ul v-poper-fix class="host-list-menu">
          <li @click.stop="action(item, index, 'open')">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ $t('base.open') }}</span>
          </li>
          <li @click.stop="action(item, index, 'edit')">
            <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ $t('base.edit') }}</span>
          </li>
          <li @click.stop="action(item, index, 'link')">
            <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ $t('base.link') }}</span>
          </li>
          <li>
            <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
            <el-dropdown @command="showConfig">
              <span class="ml-15"> {{ $t('base.configFile') }} </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="{ flag: 'nginx', item }">Nginx</el-dropdown-item>
                  <el-dropdown-item :command="{ flag: 'apache', item }">Apache</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </li>
          <li @click.stop="action(item, index, 'log')">
            <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ $t('base.log') }}</span>
          </li>
          <li @click.stop="action(item, index, 'del')">
            <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ $t('base.del') }}</span>
          </li>
        </ul>

        <template #reference>
          <div class="right">
            <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
          </div>
        </template>
      </el-popover>
    </li>
  </ul>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="65%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    custom-class="host-edit-drawer"
    :with-header="false"
  >
    <ConfigView :item="configItem" @doClose="show = false"></ConfigView>
  </el-drawer>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { handleHost } from '@/util/Host'
  import ConfigView from './Vhost.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoHostList',
    components: { ConfigView },
    props: {},
    data() {
      return {
        show: false,
        current_row: 0,
        extensionDir: '',
        task_index: 0,
        configItem: {}
      }
    },
    computed: {
      hosts() {
        return AppStore().hosts
      },
      writeHosts() {
        return AppStore().config.setup.hosts.write
      }
    },
    watch: {},
    created: function () {
      console.log('this.hosts: ', this.hosts)
      if (!this.hosts || this.hosts.length === 0) {
        AppStore().initHost()
      }
    },
    mounted() {
      IPC.send('app-fork:host', 'writeHosts', this.writeHosts).then((key: string) => {
        IPC.off(key)
      })
    },
    unmounted() {},
    methods: {
      showConfig(flag: string) {
        console.log(global.Server, flag)
        this.configItem = flag
        this.show = true
      },
      action(item: any, index: number, flag: string) {
        console.log('item: ', item)
        this.task_index = index
        switch (flag) {
          case 'open':
            shell.showItemInFolder(item.root)
            break
          case 'edit':
            EventBus.emit('Host-Edit-Item', item)
            break
          case 'log':
            EventBus.emit('Host-Logs-Item', item)
            break
          case 'del':
            this.$baseConfirm('确认删除?', undefined, {
              customClass: 'confirm-del',
              type: 'warning'
            })
              .then(() => {
                handleHost(item, 'del')
              })
              .catch(() => {})
            break
          case 'link':
            console.log('item: ', item)
            this.$baseDialog(import('./Link.vue'))
              .data({
                host: item
              })
              .noFooter()
              // @ts-ignore
              .title(this.$t('base.siteLinks'))
              .show()
            break
        }
        // @ts-ignore
        const poper = this?.$refs?.['host-list-poper-' + this.task_index]?.[0]
        console.log('poper: ', poper)
        poper && poper.hide()
      }
    }
  })
</script>

<style lang="scss">
  .confirm-del {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .host-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: auto;

    .host-item {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      padding: 0 20px;
      align-items: center;
      width: 100%;
      height: 64px;
      &.active {
        background: #32364a;
        .left .info {
          color: #fff;
        }
      }
      &:hover {
        background: #3e4257;
      }
      .left {
        display: flex;
        align-items: center;
        .icon-block {
          width: 44px;
          height: 44px;
          border-radius: 25px;
          background: #004878;
          margin-right: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .info {
          line-height: 1.5;
          display: flex;
          flex-direction: column;
          color: rgba(255, 255, 255, 0.7);
          .name {
            font-size: 15px;
          }
          .url {
            font-size: 12px;
          }
        }
      }
      .right {
        height: 39px;
        width: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 7px;
        cursor: pointer;
        &:hover {
          background: #282b3d;
        }
      }
    }
  }
  .host-list-menu {
    display: flex;
    flex-direction: column;
    background: #3f4358;
    user-select: none;
    > li {
      display: flex;
      align-items: center;
      padding: 8px 15px;
      cursor: pointer;
      .el-dropdown {
        color: #fff;
      }
      &:hover {
        background: rgb(79, 82, 105);
      }
    }
  }
  .host-list-poper {
    background: #32364a !important;
    border: none !important;
    color: #fff !important;
    padding: 0 !important;
  }
</style>
