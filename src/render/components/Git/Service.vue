<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Git</span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDir') }}</span>
            </template>
            <template #reference>
              <el-button link @click.stop="showCustomDir">
                <FolderAdd class="w-[24px] h-[24px] p-[2px]"></FolderAdd>
              </el-button>
            </template>
          </el-popover>
        </div>
        <el-button class="button" :disabled="fetching" link @click="resetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table v-loading="fetching" class="service-table" :data="versions" show-overflow-tooltip>
      <el-table-column prop="version" width="140px">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span
            style="padding: 2px 12px 2px 24px; display: block"
            class="truncate"
            :class="{
              current: isInAppEnv(scope.row)
            }"
            >{{ scope.row.version }}</span
          >
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
            <span
              class="path"
              :class="{
                current: isInAppEnv(scope.row)
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
        <template #header>
          <el-tooltip :content="I18nT('service.envTips')" placement="top" :show-after="600">
            <span>{{ I18nT('service.env') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <template v-if="ServiceActionStore.pathSeting[scope.row.bin]">
            <el-button style="width: auto; height: auto" text :loading="true"></el-button>
          </template>
          <template v-else-if="isInAppEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByApp')" :show-after="600" placement="top">
              <el-button
                link
                type="primary"
                @click.stop="ServiceActionStore.updatePath(scope.row, 'git')"
              >
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="isInEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByNoApp')" :show-after="600" placement="top">
              <el-button
                link
                type="warning"
                @click.stop="ServiceActionStore.updatePath(scope.row, 'git')"
              >
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-button
              class="current-set row-hover-show"
              link
              @click.stop="ServiceActionStore.updatePath(scope.row, 'git')"
            >
              <yb-icon
                class="current-not"
                :svg="import('@/svg/select.svg?raw')"
                width="17"
                height="17"
              />
            </el-button>
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
          <el-tooltip :content="I18nT('service.aliasTips')" placement="top" :show-after="600">
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
      <el-table-column :label="I18nT('base.action')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="left-start"
            :show-arrow="false"
            width="auto"
            @before-enter="ServiceActionStore.fetchPath"
          >
            <ul v-poper-fix class="host-list-menu">
              <li class="path-set" @click.stop="ServiceActionStore.updatePath(scope.row, 'git')">
                <template v-if="ServiceActionStore.pathSeting[scope.row.bin]">
                  <el-button style="width: auto; height: auto" text :loading="true"></el-button>
                </template>
                <template v-else>
                  <yb-icon
                    class="current"
                    :class="{
                      'text-blue-500': isInAppEnv(scope.row),
                      'opacity-100': isInAppEnv(scope.row)
                    }"
                    :svg="import('@/svg/select.svg?raw')"
                    width="17"
                    height="17"
                  />
                </template>
                <span class="ml-3">{{ I18nT('base.addToPath') }}</span>
              </li>
              <li @click.stop="ServiceActionStore.showAlias(scope.row)">
                <yb-icon
                  class="current"
                  :svg="import('@/svg/aliase.svg?raw')"
                  width="17"
                  height="17"
                />
                <span class="ml-3">{{ I18nT('service.setaliase') }}</span>
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
  import { FolderAdd } from '@element-plus/icons-vue'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { I18nT } from '@lang/index'
  import { Setup } from '@/components/ServiceManager/setup'

  const {
    appStore,
    versions,
    isInEnv,
    isInAppEnv,
    openDir,
    showCustomDir,
    resetData,
    fetchData,
    fetching
  } = Setup('git')

  fetchData()
</script>
