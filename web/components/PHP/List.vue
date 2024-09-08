<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> PHP </span>
          <el-tooltip :content="$t('base.customVersionDir')" :show-after="600">
            <el-button
              class="custom-folder-add-btn"
              :icon="FolderAdd"
              link
              @click.stop="showCustomDir"
            ></el-button>
          </el-tooltip>
        </div>
        <el-button class="button" :disabled="service?.fetching" link @click="resetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': service?.fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table v-loading="service?.fetching" class="service-table" :data="versions">
      <el-table-column prop="version" width="140px">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{ $t('base.version') }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-tooltip
              :raw-content="true"
              :content="scope.row?.error ?? $t('base.versionErrorTips')"
              popper-class="version-error-tips"
            >
              <span class="path error" @click.stop="openDir(scope.row.path)">{{
                scope.row.path
              }}</span>
            </el-tooltip>
          </template>
          <template v-else>
            <span class="path" @click.stop="openDir(scope.row.path)">{{ scope.row.path }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-button
            link
            class="status group-off"
            :class="{ off: appStore?.phpGroupStart?.[scope.row.bin] === false }"
            @click.stop="groupTrunOn(scope.row)"
          >
            <yb-icon
              style="width: 30px; height: 30px"
              :svg="import('@/svg/nogroupstart.svg?raw')"
            />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running">
                <yb-icon :svg="import('@/svg/stop2.svg?raw')" @click.stop="doStop(scope.row)" />
              </el-button>
              <el-button link class="status refresh">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="doRun(scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button link class="status start">
                <yb-icon :svg="import('@/svg/play.svg?raw')" @click.stop="doRun(scope.row)" />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="bottom-end"
            :show-arrow="false"
            width="auto"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'open')">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.open') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'conf')">
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <span class="ml-15"> php.ini </span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'fpm-conf')">
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <span class="ml-15"> php-fpm.conf </span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log-fpm')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('php.fpmLog') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log-slow')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.slowLog') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'extend')">
                <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('php.extension') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'groupstart')">
                <yb-icon
                  style="padding: 0"
                  :svg="import('@/svg/nogroupstart.svg?raw')"
                  width="18"
                  height="18"
                />
                <template v-if="appStore?.phpGroupStart?.[scope.row.bin] === false">
                  <span class="ml-10">{{ $t('php.groupStartOn') }}</span>
                </template>
                <template v-else>
                  <span class="ml-10">{{ $t('php.groupStartOff') }}</span>
                </template>
              </li>
              <li class="path-set noset">
                <yb-icon
                  class="current"
                  :svg="import('@/svg/select.svg?raw')"
                  width="17"
                  height="17"
                />
                <span class="ml-15">{{ $t('base.addToPath') }}</span>
              </li>
            </ul>
            <template #reference>
              <el-button link class="status">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </el-button>
            </template>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, reactive } from 'vue'
  import { startService, stopService, waitTime } from '@web/fn'
  import { BrewStore, SoftInstalled } from '@web/store/brew'
  import { ElLoading } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@web/fn'
  import { AppStore } from '@web/store/app'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { Service } from '@/components/ServiceManager/service'
  import { FolderAdd } from '@element-plus/icons-vue'

  if (!Service.php) {
    Service.php = {
      fetching: false
    }
  }

  const initing = ref(false)
  const brewStore = BrewStore()
  const appStore = AppStore()

  const service = computed(() => {
    return Service.php
  })

  const php = computed(() => {
    return brewStore.php
  })
  const versions = computed(() => {
    return brewStore?.php?.installed ?? []
  })

  const init = () => {
    if (initing.value) {
      return
    }
    initing.value = true
    waitTime().then(() => {
      initing.value = false
    })
  }

  const reinit = () => {
    const data = php.value
    data.installedInited = false
    init()
  }

  const checkBrew = (item: SoftInstalled) => {
    return !!global.Server.BrewCellar && item?.bin?.includes('/Cellar/')
  }

  const doRun = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    startService('php', item).then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }

  const doStop = (item: SoftInstalled) => {
    if (!item?.version) {
      return
    }
    stopService('php', item).then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
      }
    })
  }

  const groupTrunOn = (item: SoftInstalled) => {
    const dict = JSON.parse(JSON.stringify(appStore.phpGroupStart))
    const key = item.bin
    if (dict?.[key] === false) {
      dict[key] = true
      delete dict?.[key]
    } else {
      dict[key] = false
    }
    appStore.config.setup.phpGroupStart = reactive(dict)
  }

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  let PhpFpmVM: any
  import('./FpmConfig.vue').then((res) => {
    PhpFpmVM = res.default
  })

  const action = (item: SoftInstalled, index: number, flag: string) => {
    switch (flag) {
      case 'groupstart':
        groupTrunOn(item)
        break
      case 'open':
        break
      case 'conf':
        import('./Config.vue').then((res) => {
          res.default
            .show({
              version: item
            })
            .then()
        })
        break
      case 'fpm-conf':
        AsyncComponentShow(PhpFpmVM, {
          item
        }).then()
        break
      case 'log-fpm':
        import('./Logs.vue').then((res) => {
          res.default
            .show({
              version: item,
              type: 'php-fpm'
            })
            .then()
        })
        break
      case 'log-slow':
        import('./Logs.vue').then((res) => {
          res.default
            .show({
              version: item,
              type: 'php-fpm-slow'
            })
            .then()
        })
        break
      case 'extend':
        AsyncComponentShow(ExtensionsVM, {
          version: item
        }).then()
        break
      case 'brewLink':
        if (!checkBrew(item)) {
          return
        }
        const dom: HTMLElement = document.querySelector(`li[data-item-index="${index}"]`)!
        const loading = ElLoading.service({
          target: dom
        })
        waitTime().then(() => {
          loading.close()
          MessageSuccess(I18nT('base.success'))
        })
        break
    }
  }

  const resetData = () => {
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    waitTime().then(() => {
      service.value.fetching = false
    })
  }

  const openDir = (dir: string) => {}

  init()

  let CustomPathVM: any
  import('@web/components/ServiceManager/customPath.vue').then((res) => {
    CustomPathVM = res.default
  })

  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: 'php'
    }).then((res) => {
      if (res) {
        console.log('showCustomDir chagned !!!')
        resetData()
      }
    })
  }

  defineExpose({
    reinit
  })
</script>
