<template>
  <div class="host-list">
    <el-table v-loading="loading" :data="hosts" row-key="id" default-expand-all>
      <el-table-column :label="$t('host.name')">
        <template #header>
          <div class="w-p100 name-cell">
            <span>{{ $t('host.name') }}</span>
            <el-input v-model.trim="search" placeholder="search" clearable></el-input>
          </div>
        </template>
        <template #default="scope">
          <QrcodePopper :url="scope.row.name">
            <div class="link" @click.stop="openSite(scope.row)">
              <yb-icon :svg="import('@/svg/link.svg?raw')" width="18" height="18" />
              <span>
                {{ siteName(scope.row) }}
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
          <el-tooltip :content="`${scope.row.mark}`" :show-after="800">
            <span style="display: inline-block; max-width: 100%">
              {{ scope.row.mark }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="$t('host.setup')" width="100px">
        <template #default="scope">
          <el-popover
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
              <li @click.stop="action(scope.row, scope.$index, 'park')">
                <yb-icon :svg="import('@/svg/shengcheng.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('host.park') }}</span>
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
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue'
  import { handleHost } from '@/util/Host'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import QrcodePopper from './Qrcode/Index.vue'
  import Base from '@/core/Base'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import type { AppHost } from '@shared/app'

  const { shell } = require('@electron/remote')

  const loading = ref(false)
  const appStore = AppStore()
  const task_index = ref(0)
  const search = ref('')

  const hosts = computed(() => {
    let hosts: Array<any> = JSON.parse(JSON.stringify(appStore.hosts))
    if (search.value) {
      hosts = hosts.filter((h) => {
        const name = h?.name ?? ''
        const mark = h?.mark ?? ''
        return name.includes(search.value) || `${mark}`.includes(search.value)
      })
    }
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
  })

  const writeHosts = computed(() => {
    return appStore.config.setup.hosts.write
  })

  if (!hosts?.value || hosts?.value?.length === 0) {
    appStore.initHost()
  }

  onMounted(() => {
    IPC.send('app-fork:host', 'writeHosts', writeHosts.value).then((key: string) => {
      IPC.off(key)
    })
  })

  const versionText = (v?: number) => {
    if (typeof v === 'number') {
      return `${(v / 10.0).toFixed(1)}`
    }
    return ''
  }

  const siteName = (item: AppHost) => {
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
    return `${host}${portStr}`
  }

  const openSite = (item: any) => {
    const name = siteName(item)
    const url = `http://${name}`
    shell.openExternal(url)
  }

  let EditVM: any
  import('./Edit.vue').then((res) => {
    EditVM = res.default
  })
  let LogVM: any
  import('./Logs.vue').then((res) => {
    LogVM = res.default
  })
  let ConfigVM: any
  import('./Vhost.vue').then((res) => {
    ConfigVM = res.default
  })
  let LinkVM: any
  import('./Link.vue').then((res) => {
    LinkVM = res.default
  })

  const action = (item: any, index: number, flag: string) => {
    console.log('item: ', item)
    item = appStore.hosts.find((h) => h.id === item.id)
    task_index.value = index
    switch (flag) {
      case 'open':
        shell.showItemInFolder(item.root)
        break
      case 'edit':
        AsyncComponentShow(EditVM, {
          edit: item,
          isEdit: true
        }).then()
        break
      case 'log':
        AsyncComponentShow(LogVM, {
          name: item.name
        }).then()
        break
      case 'del':
        Base._Confirm(I18nT('base.delAlertContent'), undefined, {
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
        AsyncComponentShow(LinkVM, {
          host: item
        }).then()
        break
      case 'park':
        console.log('item: ', item)
        loading.value = true
        handleHost(item, 'edit', item, true).then(() => {
          loading.value = false
        })
        break
    }
  }

  const showConfig = (item: any) => {
    AsyncComponentShow(ConfigVM, {
      item
    }).then()
  }
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

    .name-cell {
      display: flex;
      align-items: center;

      > span {
        flex-shrink: 0;
        margin-right: 20px;
      }
      > .el-input {
        height: 26px;
        width: 188px;
      }
    }

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
