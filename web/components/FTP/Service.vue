<template>
  <div class="ftp-service-main">
    <div class="table-header">
      <div class="left">
        <template v-if="ftpRunning">
          <div class="status running" :class="{ disabled: ftpVersion.running }">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="serviceDo('stop')" />
          </div>
          <div class="status refresh" :class="{ disabled: ftpVersion.running }">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              @click.stop="serviceDo('restart')"
            />
          </div>
        </template>
        <div v-else class="status" :class="{ disabled: ftpDisabled }">
          <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="serviceDo('start')" />
        </div>
        <template v-if="ftpRunning">
          <div class="link">
            <span @click.stop="copyPass(linkLocal)">{{ linkLocal }}</span>
            <span @click.stop="copyPass(linkIp)">{{ linkIp }}</span>
          </div>
        </template>
      </div>
      <el-button :disabled="ftpDisabled" @click.stop="doAdd">{{ $t('base.add') }}</el-button>
    </div>
    <el-auto-resizer>
      <template #default="{ height, width }">
        <el-table-v2
          v-loading="loading"
          :row-height="42"
          :columns="columns"
          :data="allFtp"
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
  import { computed, ref } from 'vue'
  import type { Column } from 'element-plus'
  import { FtpStore } from '../../store/ftp'
  import { AppStore } from '../../store/app'
  import { BrewStore } from '../../store/brew'
  import { startService, stopService, AsyncComponentShow, waitTime } from '../../fn'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { Edit, Delete } from '@element-plus/icons-vue'

  const loading = ref(false)
  const ftpStore = FtpStore()
  const appStore = AppStore()
  const brewStore = BrewStore()

  const linkLocal = computed(() => {
    return `ftp://127.0.0.1:${ftpStore.port}`
  })
  const linkIp = computed(() => {
    return `ftp://${ftpStore.ip}:${ftpStore.port}`
  })

  const ftpVersion = computed(() => {
    const current = appStore.config.server?.['pure-ftpd']?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore?.['pure-ftpd']?.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const ftpRunning = computed(() => {
    return ftpVersion?.value?.run === true
  })

  const ftpDisabled = computed(() => {
    return (
      !ftpVersion?.value?.version ||
      brewStore?.['pure-ftpd']?.installed?.some((v) => v.running) ||
      !appStore.versionInited
    )
  })

  const serviceDo = (flag: 'start' | 'stop' | 'restart') => {
    if (ftpDisabled?.value) {
      return
    }
    let action: any
    switch (flag) {
      case 'stop':
        action = stopService('pure-ftpd', ftpVersion.value!)
        break
      case 'start':
      case 'restart':
        action = startService('pure-ftpd', ftpVersion.value!)
        break
    }
    action.then((res: any) => {
      if (typeof res === 'string') {
        ElMessage({
          type: 'error',
          message: res,
          customClass: 'cli-to-html'
        })
      } else {
        ElMessage.success(I18nT('base.success'))
      }
    })
  }

  const doAdd = (item?: any) => {
    import('./Add.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item
      }).then()
    })
  }

  const copyPass = (): void => {
    ElMessage.success(I18nT('base.copySuccess'))
  }
  const openDir = (): void => {}
  const doEdit = (data: any): void => {
    console.log('doEdit: ', data)
    doAdd(data)
  }
  const doDel = (index: number): void => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), undefined, {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      closeOnClickModal: false,
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        loading.value = true
        waitTime().then(() => {
          ftpStore.allFtp.splice(index, 1)
          ElMessage.success(I18nT('base.success'))
          loading.value = false
        })
      })
      .catch(() => {})
  }

  const allFtp = computed(() => {
    return ftpStore.allFtp
  })
  const columns: Column<any>[] = [
    {
      key: 'user',
      title: 'user',
      dataKey: 'user',
      width: 150,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.ftpTableHeadUser')}</span>
      },
      cellRenderer: ({ cellData: user }) => (
        <span class="user" onClick={() => copyPass()}>
          {user}
        </span>
      )
    },
    {
      key: 'pass',
      title: 'pass',
      dataKey: 'pass',
      width: 200,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.ftpTableHeadPass')}</span>
      },
      cellRenderer: ({ cellData: pass }) => (
        <span class="pass" onClick={() => copyPass()}>
          {pass}
        </span>
      )
    },
    {
      key: 'dir',
      title: 'dir',
      dataKey: 'dir',
      class: 'host-column',
      headerClass: 'host-column',
      width: 200,
      headerCellRenderer: () => {
        return <span class="flex items-center">{I18nT('util.ftpTableHeadDir')}</span>
      },
      cellRenderer: ({ cellData: dir }) => (
        <span class="dir" onClick={() => openDir()}>
          {dir}
        </span>
      )
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
      cellRenderer: ({ rowData: data, rowIndex: index }) => (
        <div class="setup">
          <Edit class="setup-icon" onClick={() => doEdit(data)}>
            编辑
          </Edit>
          <Delete class="setup-icon" onClick={() => doDel(index)}>
            编辑
          </Delete>
        </div>
      )
    }
  ]
</script>

<style lang="scss">
  .ftp-service-main {
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
      width: calc(100% - 450px) !important;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        user-select: text;
      }
    }
  }
</style>
