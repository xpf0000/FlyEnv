<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
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
          <span
            style="padding: 2px 12px 2px 24px; display: block"
            :class="{
              current:
                currentVersion?.version === scope.row.version &&
                currentVersion?.path === scope.row.path
            }"
            >{{ scope.row.version }}</span
          >
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
            <span
              class="path"
              :class="{
                current:
                  currentVersion?.version === scope.row.version &&
                  currentVersion?.path === scope.row.path
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <template
            v-if="
              currentVersion?.version === scope.row.version &&
              currentVersion?.path === scope.row.path
            "
          >
            <el-button
              link
              class="status group-off"
              :class="{ off: appStore.phpGroupStart[scope.row.bin] === false }"
            >
              <yb-icon
                style="width: 30px; height: 30px"
                :svg="import('@/svg/nogroupstart.svg?raw')"
                @click.stop="groupTrunOn(scope.row)"
              />
            </el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="$t('base.service')" :prop="null" width="110px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running" :class="{ disabled: versionRunning }">
                <yb-icon
                  :svg="import('@/svg/stop2.svg?raw')"
                  @click.stop="serviceDo('stop', scope.row)"
                />
              </el-button>
              <el-button link class="status refresh" :class="{ disabled: versionRunning }">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="serviceDo('restart', scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button
                link
                class="status start"
                :class="{
                  disabled: versionRunning || !scope.row.version,
                  current:
                    currentVersion?.version === scope.row.version &&
                    currentVersion?.path === scope.row.path
                }"
              >
                <yb-icon
                  :svg="import('@/svg/play.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, type ComputedRef, reactive } from 'vue'
  import { reloadService, startService, stopService, waitTime } from '@web/fn'
  import { AppSofts, AppStore } from '@web/store/app'
  import { BrewStore, type SoftInstalled } from '@web/store/brew'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { MysqlStore } from '@web/store/mysql'
  import { Service } from '@/components/ServiceManager/service'

  const props = defineProps<{
    typeFlag:
      | 'nginx'
      | 'apache'
      | 'memcached'
      | 'mysql'
      | 'mariadb'
      | 'redis'
      | 'php'
      | 'mongodb'
      | 'pure-ftpd'
      | 'postgresql'
    title: string
  }>()

  if (!Service[props.typeFlag]) {
    Service[props.typeFlag] = {
      fetching: false
    }
  }

  const appStore = AppStore()
  const brewStore = BrewStore()

  const service = computed(() => {
    return Service[props.typeFlag]
  })

  const versions = computed(() => {
    return brewStore?.[props.typeFlag]?.installed
  })

  const version = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return appStore.config.server[flag].current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return brewStore[flag].installed?.find(
      (i) => i.path === version?.value?.path && i.version === version?.value?.version
    )
  })

  const versionRunning = computed(() => {
    const flag: keyof typeof AppSofts = props.typeFlag as any
    return brewStore[flag].installed?.some((f) => f.running)
  })

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

  const serviceDo = (flag: 'stop' | 'start' | 'restart' | 'reload', item: SoftInstalled) => {
    if (!item?.version || !item?.path) {
      return
    }
    const typeFlag: keyof typeof AppSofts = props.typeFlag as any
    let action: any
    switch (flag) {
      case 'stop':
        action = stopService(typeFlag, item)
        break
      case 'start':
      case 'restart':
        action = startService(typeFlag, item)
        break
      case 'reload':
        action = reloadService(typeFlag, item)
        break
    }
    action.then((res: any) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        if (typeFlag === 'mysql') {
          const mysqlStore = MysqlStore()
          if (flag === 'stop') {
            mysqlStore.groupStop().then()
          } else {
            mysqlStore.groupStart().then()
          }
        }
        if (currentVersion.value) {
          currentVersion.value.run = false
          currentVersion.value.running = false
        }
        if (flag === 'stop') {
          item.run = false
          item.running = false
        } else {
          item.run = true
          item.running = false
          if (
            item.version !== currentVersion.value?.version ||
            item.path !== currentVersion.value?.path
          ) {
            appStore.UPDATE_SERVER_CURRENT({
              flag: props.typeFlag,
              data: JSON.parse(JSON.stringify(item))
            })
          }
        }
        MessageSuccess(I18nT('base.success'))
      }
    })
  }
</script>
