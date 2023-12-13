<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ cardHeadTitle }} </span>
          <template v-if="!brewRunning && !showNextBtn">
            <el-select v-model="libSrc" style="margin-left: 8px" :disabled="currentType.getListing">
              <el-option :disabled="!checkBrew()" value="brew" label="Homebrew"></el-option>
              <el-option :disabled="!checkPort()" value="port" label="MacPorts"></el-option>
            </el-select>
          </template>
        </div>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
          $t('base.confirm')
        }}</el-button>
        <el-button
          v-else
          class="button"
          :disabled="currentType.getListing || brewRunning"
          link
          @click="reGetData"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': currentType.getListing || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="showLog">
      <div ref="logs" class="logs"></div>
    </template>
    <el-table
      v-else
      :empty-text="$t('base.gettingVersion')"
      height="100%"
      :data="tableData"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="$t('base.brewLibrary')"> </el-table-column>
      <el-table-column prop="version" :label="$t('base.version')" width="150"> </el-table-column>
      <el-table-column align="center" :label="$t('base.isInstalled')" width="120">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.installed"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="$t('base.operation')" width="120">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="brewRunning"
            @click="handleEdit(scope.$index, scope.row)"
            >{{ scope.row.installed ? $t('base.uninstall') : $t('base.install') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, nextTick, ref, watch } from 'vue'
  import { AppSoftInstalledItem, BrewStore } from '../../store/brew'
  import { I18nT } from '@shared/lang'
  import { waitTime } from '../../fn'

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
  }>()

  const showNextBtn = ref(false)
  const logs = ref()

  const brewStore = BrewStore()

  const cardHeadTitle = computed(() => {
    return brewStore.cardHeadTitle
  })
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })
  const log = computed(() => {
    return brewStore.log
  })
  const currentType: ComputedRef<AppSoftInstalledItem> = computed(() => {
    return brewStore?.[props.typeFlag] as any
  })

  const libSrc = computed({
    get() {
      return (
        brewStore.LibUse[props.typeFlag] ??
        (checkBrew() ? 'brew' : checkPort() ? 'port' : undefined)
      )
    },
    set(v: 'brew' | 'port') {
      brewStore.LibUse[props.typeFlag] = v
    }
  })

  const tableData = computed(() => {
    const arr = []
    let list: any
    if (libSrc.value === 'brew') {
      list = currentType.value.list.homebrew
    } else {
      list = currentType.value.list.macports
    }
    console.log('list: ', list)
    for (const name in list) {
      const value = list[name]
      const nums = value.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          let num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      arr.push({
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
    return arr
  })
  const logLength = computed(() => {
    return log?.value?.length
  })
  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })

  const checkBrew = () => {
    return true
  }
  const checkPort = () => {
    return true
  }

  const getData = () => {}
  const reGetData = () => {
    getData()
  }

  const handleEdit = (index: number, row: any) => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    if (row.installed) {
      brewStore.cardHeadTitle = `${I18nT('base.uninstall')} ${row.name}`
    } else {
      brewStore.cardHeadTitle = `${I18nT('base.install')} ${row.name}`
    }

    waitTime().then(() => {
      brewStore.brewRunning = false
      showNextBtn.value = true
      brewStore.showInstallLog = false
      currentType.value.installedInited = false
      reGetData()
    })
  }

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  watch(libSrc, (v) => {
    if (v) {
      reGetData()
    }
  })

  watch(brewRunning, (val) => {
    if (!val) {
      getData()
    }
  })
  watch(
    () => props.typeFlag,
    () => {
      reGetData()
    }
  )
  watch(logLength, () => {
    if (showInstallLog?.value) {
      nextTick(() => {
        let container: HTMLElement = logs?.value as any
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  })

  getData()
  if (!brewRunning?.value) {
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  }
</script>

<style lang="scss">
  @keyframes fa-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .fa-spin {
    animation: fa-spin 1s 0s infinite linear;
  }

  .version-manager {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    height: 100%;

    &.el-card {
      display: flex;
      flex-direction: column;

      .el-card__header {
        flex-shrink: 0;

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
      }

      .el-card__body {
        flex: 1;
        overflow: hidden;

        .cell-status {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logs {
          height: 100%;
          overflow: auto;
          word-break: break-word;

          &::-webkit-scrollbar {
            display: none;
          }
        }
      }
    }

    .refresh-icon {
      width: 24px;
      height: 24px;
    }

    .installed {
      width: 18px;
      height: 18px;
      color: #01cc74;
    }
  }
</style>
