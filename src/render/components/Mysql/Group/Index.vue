<template>
  <div class="mysql-group-main" :class="{ loading: fetching }">
    <div class="table-header">
      <div class="left">
        <template v-if="running">
          <div class="status running" :class="{ disabled: disabled }">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="groupDo('stop')" />
          </div>
          <div class="status refresh" :class="{ disabled: disabled }">
            <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" @click.stop="groupDo('start')" />
          </div>
        </template>
        <div v-else class="status" :class="{ disabled: disabled }">
          <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="groupDo('start')" />
        </div>
      </div>
      <el-button @click.stop="doAdd(undefined)">{{ $t('base.add') }}</el-button>
    </div>
    <el-auto-resizer>
      <template #default="{ height, width }">
        <el-table-v2
          :row-height="48"
          :columns="columns"
          :data="all"
          :width="width"
          :height="height"
          fixed
        >
        </el-table-v2>
      </template>
    </el-auto-resizer>
  </div>
</template>

<script lang="tsx" setup>
  import { computed } from 'vue'
  import { MysqlStore } from '@/store/mysql'
  import type { Column } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import YbIcon from '@/components/YbSvgIcon/vue-svg-icons.vue'
  import type { MysqlGroupItem } from '@shared/app'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import Popper from './SetupPopper.vue'

  const { shell } = require('@electron/remote')

  const mysqlStore = MysqlStore()

  mysqlStore.init().then()

  const all = computed(() => {
    return mysqlStore.all
  })

  const fetching = computed(() => {
    return mysqlStore.all.some((m) => m?.version?.fetching)
  })

  const running = computed(() => {
    return mysqlStore.all.some((m) => m?.version?.running)
  })

  const disabled = computed(() => {
    return all.value.length === 0 || fetching.value
  })
  const doAdd = (item?: MysqlGroupItem) => {
    import('./Add.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item
      }).then()
    })
  }

  const handleRes = (res: true | string) => {
    if (res === true) {
      MessageSuccess(I18nT('base.success'))
    } else {
      MessageError(res)
    }
  }

  const doRun = (data: MysqlGroupItem) => {
    mysqlStore.start(data).then(handleRes)
  }

  const doStop = (data: MysqlGroupItem) => {
    mysqlStore.stop(data).then(handleRes)
  }

  const showItem = (dir: string) => {
    shell.showItemInFolder(dir)
  }

  const columns: Column<any>[] = [
    {
      key: 'id',
      title: 'ID',
      dataKey: 'id',
      align: 'center',
      width: 100,
      headerCellRenderer: () => {
        return <span class="flex items-center">ID</span>
      },
      cellRenderer: ({ cellData: id }) => <span class="user">{id}</span>
    },
    {
      key: 'version',
      title: 'version',
      dataKey: 'version.version',
      align: 'center',
      width: 120,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.mysqlVersion')}</span>
      },
      cellRenderer: ({ cellData: version }) => <span class="user">{version}</span>
    },
    {
      key: 'port',
      title: 'port',
      dataKey: 'port',
      width: 90,
      align: 'center',
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.mysqlPort')}</span>
      },
      cellRenderer: ({ cellData: port }) => <span class="dir">{port}</span>
    },
    {
      key: 'dataDir',
      title: 'dataDir',
      dataKey: 'dataDir',
      class: 'host-column',
      headerClass: 'host-column',
      width: 200,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.mysqlDataDir')}</span>
      },
      cellRenderer: ({ cellData: dataDir }) => (
        <span class="pass" onClick={() => showItem(dataDir)}>
          {dataDir}
        </span>
      )
    },
    {
      key: 'state',
      title: 'state',
      dataKey: 'version',
      width: 140,
      align: 'center',
      class: 'state-column',
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.mysqlState')}</span>
      },
      cellRenderer: ({ rowData: data }) => {
        if (data?.version?.running) {
          return (
            <div class="state-wapper">
              <svg
                onClick={() => doStop(data)}
                class="yb-icon stop"
                viewBox="0 0 1024 1024"
                version="1.1"
                width="20"
                height="20"
              >
                <path d="M359.178429 124.06769l0 775.863596c0 32.459273-26.318412 58.777685-58.777685 58.777685s-58.777685-26.318412-58.777685-58.777685L241.62306 124.06769c0-32.459273 26.318412-58.777685 58.777685-58.777685S359.178429 91.608417 359.178429 124.06769zM723.599256 65.290005c-32.459273 0-58.777685 26.318412-58.777685 58.777685l0 775.863596c0 32.459273 26.318412 58.777685 58.777685 58.777685s58.777685-26.318412 58.777685-58.777685L782.37694 124.06769C782.37694 91.608417 756.058528 65.290005 723.599256 65.290005z"></path>
              </svg>
              <svg
                onClick={() => doRun(data)}
                class="yb-icon refresh"
                viewBox="0 0 1024 1024"
                width="20"
                height="20"
              >
                <path d="M160 320l128 192H192a320 320 0 0 0 534.144 237.76l12.16-11.52 45.312 45.184A384 384 0 0 1 128 512H32l128-192zM512 128a384 384 0 0 1 384 384h96l-128 192-128-192H832a320 320 0 0 0-533.952-237.952l-12.16 11.52-45.312-45.248A382.848 382.848 0 0 1 512 128z"></path>
              </svg>
            </div>
          )
        } else {
          return (
            <div class="state-wapper">
              <svg
                onClick={() => doRun(data)}
                class="yb-icon play"
                viewBox="0 0 1024 1024"
                version="1.1"
                width="20"
                height="20"
              >
                <path d="M213.333333 65.386667a85.333333 85.333333 0 0 1 43.904 12.16L859.370667 438.826667a85.333333 85.333333 0 0 1 0 146.346666L257.237333 946.453333A85.333333 85.333333 0 0 1 128 873.28V150.72a85.333333 85.333333 0 0 1 85.333333-85.333333z m0 64a21.333333 21.333333 0 0 0-21.184 18.837333L192 150.72v722.56a21.333333 21.333333 0 0 0 30.101333 19.456l2.197334-1.152L826.453333 530.282667a21.333333 21.333333 0 0 0 2.048-35.178667l-2.048-1.386667L224.298667 132.416A21.333333 21.333333 0 0 0 213.333333 129.386667z"></path>
              </svg>
              <div style="width:20px;opacity: 0;"></div>
            </div>
          )
        }
      }
    },
    {
      key: 'setup',
      title: 'setup',
      dataKey: 'setup',
      align: 'center',
      width: 100,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.ftpTableHeadSetup')}</span>
      },
      cellRenderer: ({ rowData: data }) => (
        <div class="setup">
          <Popper item={data}></Popper>
        </div>
      )
    }
  ]

  const groupDo = (flag: 'start' | 'stop') => {
    switch (flag) {
      case 'start':
        mysqlStore.groupStart().then(handleRes)
        break
      case 'stop':
        mysqlStore.groupStop().then(handleRes)
        break
    }
  }
</script>

<style lang="scss">
  .mysql-group-main {
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .table-header {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background-color: #141414;
      color: #fff;
      border-bottom: 1px #363637 solid;
      font-weight: 700;

      .left {
        flex-shrink: 0;
        display: flex;
        align-items: center;

        > div {
          display: flex;
          align-items: center;
          justify-content: center;

          &.running {
            svg {
              color: #01cc74;
            }
          }

          &.refresh {
            margin-left: 20px;

            svg {
              width: 23px;
              height: 23px;
            }
          }

          &.disabled {
            svg {
              color: #7c7c7c;
              cursor: not-allowed;
            }
          }
        }

        svg {
          width: 21px;
          height: 21px;
          cursor: pointer;

          &:hover {
            color: #fdab1f;
          }
        }

        .link {
          margin-left: 30px;

          > span {
            color: #01cc74;
            margin: 0 20px;
            cursor: pointer;
          }
        }
      }
    }

    > .el-auto-resizer {
      height: auto !important;
      flex: 1;
      overflow: hidden;
    }

    .user,
    .pass,
    .dir {
      cursor: pointer;
      &:hover {
        color: #409eff;
      }
    }

    .setup {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    .setup-icon {
      flex-shrink: 0;
      width: 15px;
      height: 15px;
      margin: 0 8px;
      cursor: pointer;

      &:hover {
        color: #409eff;
      }
    }

    .host-column {
      flex: 1 !important;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        user-select: text;
      }
    }

    .state-wapper {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 0 20px;

      > svg {
        cursor: pointer;

        &:hover {
          color: #fdab1f;
        }

        &.stop {
          color: #01cc74;
        }
      }
    }

    &.loading {
      svg {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
</style>
