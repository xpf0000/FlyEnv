<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> PHP </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDir') }}</span>
            </template>
            <template #reference>
              <el-button
                class="custom-folder-add-btn"
                :icon="FolderAdd"
                link
                @click.stop="showCustomDir"
              ></el-button>
            </template>
          </el-popover>
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
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-popover popper-class="version-error-tips" width="auto" placement="top">
              <template #reference>
                <span class="path error" @click.stop="openDir(scope.row.path)">{{
                  scope.row.path
                }}</span>
              </template>
              <template #default>
                <span>{{ scope.row?.error ?? I18nT('base.versionErrorTips') }}</span>
              </template>
            </el-popover>
          </template>
          <template v-else>
            <span class="path" @click.stop="openDir(scope.row.path)">{{ scope.row.path }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('php.quickStart')" :prop="null" width="100px" align="center">
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
      <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
        <template #header>
          <el-tooltip :content="I18nT('service.envTips')" placement="top" show-after="600">
            <span>{{ I18nT('service.env') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <template v-if="isInAppEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByApp')" :show-after="600" placement="top">
              <el-button link type="primary">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="isInEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByNoApp')" :show-after="600" placement="top">
              <el-button link type="warning">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="ServiceActionStore.pathSeting[scope.row.bin]">
            <el-button style="width: auto; height: auto" text :loading="true"></el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column
        :show-overflow-tooltip="true"
        :label="I18nT('service.alias')"
        :prop="null"
        width="120px"
        align="left"
      >
        <template #header>
          <el-tooltip :content="I18nT('service.aliasTips')" placement="top" show-after="600">
            <span>{{ I18nT('service.alias') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <div class="flex items-center h-full min-h-9"
            ><span class="truncate">{{
              appStore.config.setup.alias?.[scope.row.bin]?.map((a) => a.name)?.join(',')
            }}</span></div
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running">
                <yb-icon
                  :svg="import('@/svg/stop2.svg?raw')"
                  @click.stop="serviceDo('stop', scope.row)"
                />
              </el-button>
              <el-button link class="status refresh">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button link class="status start">
                <yb-icon
                  :svg="import('@/svg/play.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <EXT :item="scope.row" type="php">
            <li @click.stop="action(scope.row, scope.$index, 'open')">
              <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ I18nT('base.open') }}</span>
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
              <span class="ml-15">{{ I18nT('php.fpmLog') }}</span>
            </li>
            <li @click.stop="action(scope.row, scope.$index, 'log-slow')">
              <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ I18nT('base.slowLog') }}</span>
            </li>
            <li @click.stop="action(scope.row, scope.$index, 'extend')">
              <yb-icon :svg="import('@/svg/extend.svg?raw')" width="13" height="13" />
              <span class="ml-15">{{ I18nT('php.extension') }}</span>
            </li>
            <li @click.stop="action(scope.row, scope.$index, 'groupstart')">
              <yb-icon
                style="padding: 0"
                :svg="import('@/svg/nogroupstart.svg?raw')"
                width="18"
                height="18"
              />
              <template v-if="appStore?.phpGroupStart?.[scope.row.bin] === false">
                <span class="ml-10">{{ I18nT('php.groupStartOn') }}</span>
              </template>
              <template v-else>
                <span class="ml-10">{{ I18nT('php.groupStartOff') }}</span>
              </template>
            </li>
          </EXT>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { FolderAdd } from '@element-plus/icons-vue'
  import EXT from '@/components/ServiceManager/EXT/index.vue'
  import { Setup } from '@/components/ServiceManager/setup'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'

  const { shell } = require('@electron/remote')

  const {
    appStore,
    service,
    versions,
    isInEnv,
    isInAppEnv,
    groupTrunOn,
    openDir,
    serviceDo,
    showCustomDir,
    resetData
  } = Setup('php')

  let ExtensionsVM: any
  import('./Extends.vue').then((res) => {
    ExtensionsVM = res.default
  })

  let PhpFpmVM: any
  import('./FpmConfig.vue').then((res) => {
    PhpFpmVM = res.default
  })

  let ConfVM: any
  import('./Config.vue').then((res) => {
    ConfVM = res.default
  })

  let LogVM: any
  import('./Logs.vue').then((res) => {
    LogVM = res.default
  })

  const action = (item: SoftInstalled, index: number, flag: string) => {
    switch (flag) {
      case 'groupstart':
        groupTrunOn(item)
        break
      case 'open':
        shell.openPath(item.path)
        break
      case 'conf':
        AsyncComponentShow(ConfVM, {
          version: item
        }).then()
        break
      case 'fpm-conf':
        AsyncComponentShow(PhpFpmVM, {
          item
        }).then()
        break
      case 'log-fpm':
        AsyncComponentShow(LogVM, {
          version: item,
          type: 'php-fpm'
        }).then()
        break
      case 'log-slow':
        AsyncComponentShow(LogVM, {
          version: item,
          type: 'php-fpm-slow'
        }).then()
        break
      case 'extend':
        AsyncComponentShow(ExtensionsVM, {
          version: item
        }).then()
        break
    }
  }
</script>
