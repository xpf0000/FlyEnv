<template>
  <div class="host-list">
    <el-table :data="hosts" row-key="id" default-expand-all>
      <el-table-column :label="$t('host.name')">
        <template #default="scope">
          <QrcodePopper :url="scope.row.name">
            <div class="link" @click.stop="openSite(scope.row)">
              <yb-icon :svg="import('@/svg/link.svg?raw')" width="18" height="18" />
              <span>
                {{ scope.row.name }}
              </span>
            </div>
          </QrcodePopper>
        </template>
      </el-table-column>
      <el-table-column align="center" width="120px" :label="$t('host.phpVersion')">
        <template #default="scope">
          <span>
            {{ versionText(scope.row.phpVersion) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('host.mark')">
        <template #default="scope">
          <el-tooltip :content="scope.row.mark">
            <span style="display: inline-block; max-width: 100%">
              {{ scope.row.mark }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="$t('host.setup')" width="100px">
        <template #default="scope">
          <el-popover
            :ref="'host-list-poper-' + scope.$index"
            effect="dark"
            popper-class="host-list-poper"
            placement="bottom-end"
            width="150"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'open')">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.open') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'edit')">
                <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.edit') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'link')">
                <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.link') }}</span>
              </li>
              <li>
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <el-dropdown @command="showConfig">
                  <span class="ml-15"> {{ $t('base.configFile') }} </span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :command="{ flag: 'nginx', item: scope.row }"
                        >Nginx</el-dropdown-item
                      >
                      <el-dropdown-item :command="{ flag: 'apache', item: scope.row }"
                        >Apache</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.log') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'del')">
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
        </template>
      </el-table-column>
    </el-table>
  </div>
  <el-drawer
    ref="host-edit-drawer"
    v-model="show"
    size="65%"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    class="host-edit-drawer"
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
  import { BrewStore } from '@/store/brew'
  import QrcodePopper from './Qrcode/Index.vue'

  const { shell } = require('@electron/remote')

  export default defineComponent({
    name: 'MoHostList',
    components: { ConfigView, QrcodePopper },
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
        const hosts: Array<any> = JSON.parse(JSON.stringify(AppStore().hosts))
        const arr: Array<any> = []
        const findChild = (item: any) => {
          const sub = hosts.filter((h) => {
            let name: any = h.name.split('.')
            let has = false
            while (!has && name.length > 0) {
              name.shift()
              const str = name.join('.').trim()
              has = item.name.trim() === str
            }
            return has
          })
          sub.forEach((s) => {
            s.pid = item.id
          })
          item.children = sub
        }
        hosts.forEach((h) => {
          findChild(h)
        })
        hosts.forEach((h) => {
          if (!h.pid) {
            arr.push(h)
          }
        })
        return arr
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
      versionText(v?: number) {
        if (typeof v === 'number') {
          return `${(v / 10.0).toFixed(1)}`
        }
        return ''
      },
      openSite(item: any) {
        const host = item.name
        const brewStore = BrewStore()
        const nginxRunning = brewStore.nginx.installed.find((i) => i.run)
        const apacheRunning = brewStore.apache.installed.find((i) => i.run)
        let port = 80
        if (nginxRunning) {
          port = item.port.nginx
        } else if (apacheRunning) {
          port = item.port.apache
        }
        const portStr = port === 80 ? '' : `:${port}`
        const url = `http://${host}${portStr}`
        shell.openExternal(url)
      },
      showConfig(flag: string) {
        console.log(global.Server, flag)
        this.configItem = flag
        this.show = true
      },
      action(item: any, index: number, flag: string) {
        console.log('item: ', item)
        item = AppStore().hosts.find((h) => h.id === item.id)
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
            this.$baseConfirm(this.$t('base.delAlertContent'), undefined, {
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
            cursor: pointer;

            &:hover {
              color: #409eff;
            }
          }
          .url {
            font-size: 12px;
          }
        }
      }
    }
    .el-table__cell {
      &.is-center {
        > .cell {
          justify-content: center;
        }
      }

      > .cell {
        display: flex;
        align-items: center;

        span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .link {
        cursor: pointer;
        padding: 3px 8px;
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        overflow: hidden;

        svg {
          margin-right: 8px;
          flex-shrink: 0;
        }
        &:hover {
          color: #409eff;
        }
      }
    }
    .right {
      height: 34px;
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
    width: auto !important;
  }
</style>
