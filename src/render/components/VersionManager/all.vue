<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDirTips') }}</span>
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
          <el-button class="button" link @click="openURL(url)">
            <yb-icon
              style="width: 20px; height: 20px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
          <el-radio-group v-model="tableTab" size="small" class="ml-6">
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Local')"
              value="local"
            ></el-radio-button>
            <el-radio-button
              class="flex-1"
              :label="I18nT('versionmanager.Library')"
              value="lib"
            ></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="fetching" @click="reGetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table
      class="service-table"
      height="100%"
      :data="tableData"
      :border="false"
      style="width: 100%"
    >
      <template #empty>
        <template v-if="fetching">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="version" width="200">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span
            :class="{
              current: checkEnvPath(scope.row)
            }"
            style="padding: 2px 12px 2px 24px; display: block"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="tableTab === 'local' ? I18nT('base.path') : null">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <span
              class="path"
              :class="{
                current: checkEnvPath(scope.row)
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
          <template v-else>
            <div class="cell-progress">
              <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
            </div>
          </template>
        </template>
      </el-table-column>
      <template v-if="tableTab === 'lib'">
        <el-table-column :label="I18nT('base.source')" width="120">
          <template #default="scope">
            <span>{{ scope.row.source }}</span>
          </template>
        </el-table-column>
      </template>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
        <template #default="scope">
          <div class="cell-status">
            <template v-if="!scope.row.downing && (scope.row.installed || scope.row?.path)">
              <yb-icon :svg="import('@/svg/ok.svg?raw')" class="installed"></yb-icon>
            </template>
          </div>
        </template>
      </el-table-column>
      <template v-if="tableTab === 'local'">
        <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
          <template #header>
            <el-tooltip :content="I18nT('service.envTips')" placement="top" show-after="600">
              <span>{{ I18nT('service.env') }}</span>
            </el-tooltip>
          </template>
          <template #default="scope">
            <template v-if="isInEnv(scope.row)">
              <el-button link type="primary">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </template>
            <template v-else-if="ServiceActionStore.pathSeting[scope.row.bin]">
              <el-button style="width: auto; height: auto" text :loading="true"></el-button>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('service.alias')" :prop="null" width="120px" align="left">
          <template #header>
            <el-tooltip :content="I18nT('service.aliasTips')" placement="top" show-after="600">
              <span>{{ I18nT('service.alias') }}</span>
            </el-tooltip>
          </template>
          <template #default="scope">
            <template v-if="scope.row?.aliasEditing">
              <el-input
                v-model.trim="scope.row.alias"
                v-click-outside="ServiceActionStore.onAliasEnd"
                :autofocus="true"
                class="app-alisa-edit"
                @change="ServiceActionStore.onAliasEnd"
              ></el-input>
            </template>
            <template v-else-if="ServiceActionStore.aliasSeting[scope.row.bin]">
              <el-button style="width: auto; height: auto" text :loading="true"></el-button>
            </template>
            <template v-else>
              <div
                class="flex items-center h-full"
                @dblclick.stop="ServiceActionStore.showAlias(scope.row)"
                >{{ appStore.config.setup.alias?.[scope.row.bin] }}</div
              >
            </template>
          </template>
        </el-table-column>
      </template>
      <el-table-column align="center" :label="I18nT('base.operation')" width="150">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <ExtSet :item="scope.row" :type="typeFlag" />
          </template>
          <template v-else>
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :loading="scope.row.downing"
              :disabled="scope.row.downing"
              @click="handleEdit(scope.row)"
              >{{
                !scope.row.downing && scope.row.installed
                  ? I18nT('base.uninstall')
                  : I18nT('base.install')
              }}</el-button
            >
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import ExtSet from '@/components/ServiceManager/EXT/index.vue'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'
  import { SetupAll } from '@/components/VersionManager/setupAll'
  import type { AllAppModule } from '@/core/type'
  import { FolderAdd } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'
  import type { SoftInstalled } from '@/store/brew'
  import { dirname } from 'path'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    url: string
  }>()

  const appStore = AppStore()

  const isInEnv = (item: SoftInstalled) => {
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const {
    openURL,
    reGetData,
    fetching,
    tableData,
    checkEnvPath,
    openDir,
    handleEdit,
    showCustomDir,
    tableTab
  } = SetupAll(props.typeFlag)
  ServiceActionStore.fetchPath()
</script>
