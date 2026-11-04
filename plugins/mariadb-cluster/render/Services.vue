<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> MariaDB </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDirTips') }}</span>
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
            style="padding: 2px 12px 2px 24px"
            class="truncate"
            :class="{
              current:
                currentVersion?.version === scope.row.version &&
                currentVersion?.path === scope.row.path
            }"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('common.label.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-popover
              :show-after="600"
              popper-class="version-error-tips"
              width="auto"
              :placement="scope.$index < 3 ? 'bottom' : 'top'"
            >
              <template #reference>
                <span class="path error" @click.stop="openDir(scope.row.path)">{{
                  scope.row.path
                }}</span>
              </template>
              <template #default>
                <VersionErrorTips :type-flag="typeFlag" :version="scope.row" />
              </template>
            </el-popover>
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
      <el-table-column
        :label="I18nT('base.remark')"
        :prop="null"
        width="140px"
        align="left"
        :show-overflow-tooltip="false"
      >
        <template #default="scope">
          <div class="version-note-cell" @dblclick.stop="editNote(scope.row)">
            <el-input
              v-if="editingNoteKey === noteKey(scope.row)"
              v-model="editingNoteValue"
              size="small"
              maxlength="200"
              clearable
              @blur="saveNote(scope.row)"
              @keyup.enter="saveNote(scope.row)"
              @keyup.esc="cancelNoteEdit"
            />
            <template v-else>
              <el-tooltip :content="getNote(scope.row)" :disabled="!getNote(scope.row)">
                <span
                  class="version-note-text"
                  :class="{
                    empty: !getNote(scope.row)
                  }"
                  >{{ getNote(scope.row) }}</span
                >
              </el-tooltip>
              <el-button
                class="version-note-edit"
                link
                :icon="EditPen"
                @click.stop="editNote(scope.row)"
              />
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
        <template #header>
          <el-tooltip :content="I18nT('service.envTips')" placement="top" :show-after="600">
            <span class="truncate">{{ I18nT('service.env') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <template v-if="ServiceActionStore.pathSeting[scope.row.bin]">
            <el-button style="width: auto; height: auto" text :loading="true"></el-button>
          </template>
          <template v-else-if="isInAppEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByApp')" :show-after="600" placement="top">
              <el-button link type="primary" @click.stop="actions.environment(scope.row)">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="isInEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByNoApp')" :show-after="600" placement="top">
              <el-button link type="warning" @click.stop="actions.environment(scope.row)">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-button
              class="current-set row-hover-show"
              link
              @click.stop="actions.environment(scope.row)"
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
            <span class="truncate">{{ I18nT('service.alias') }}</span>
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
      <el-table-column
        fixed="right"
        :label="I18nT('common.label.action')"
        :prop="null"
        width="100px"
        align="center"
      >
        <template #default="scope">
          <ServiceActions :item="scope.row" />
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ref, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { EditPen, FolderAdd } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import { installedVersionNoteKey } from '@/util/InstalledVersionNote'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import VersionErrorTips from '@/components/ServiceManager/VersionErrorTips.vue'
  import ServiceActions from './ServiceActions.vue'
  import {
    InstallationActionsManager as actions,
    installedVersionNote,
    ServiceActionStore
  } from './installations'

  const typeFlag = 'mariadb'
  const appStore = AppStore()
  const module = BrewStore().module(typeFlag)
  const fetching = computed(() => module.fetchInstalleding || !!actions.operations.refresh)
  const versions = computed(() => module.installed)
  const currentVersion = computed(() => {
    const current = appStore.config.server?.mariadb?.current
    return versions.value.find(
      (item) => item.path === current?.path && item.version === current?.version
    )
  })
  const editingNoteKey = ref('')
  const editingNoteValue = ref('')
  const noteKey = (row: ModuleInstalledItem) => installedVersionNoteKey(row, typeFlag)
  const getNote = (row: ModuleInstalledItem) => installedVersionNote(row, typeFlag)
  const editNote = (row: ModuleInstalledItem) => {
    editingNoteKey.value = noteKey(row)
    editingNoteValue.value = getNote(row)
  }
  const cancelNoteEdit = () => {
    editingNoteKey.value = ''
    editingNoteValue.value = ''
  }
  const saveNote = async (row: ModuleInstalledItem) => {
    if (editingNoteKey.value !== noteKey(row)) return
    await actions.note(row, editingNoteValue.value)
    cancelNoteEdit()
  }
  const isInEnv = ServiceActionStore.isInEnv
  const isInAppEnv = ServiceActionStore.isInAppEnv
  const openDir = (path: string) => actions.open(path)
  const showCustomDir = () => actions.customDirectories()
  const resetData = () => actions.refresh()
  onMounted(() => {
    actions.refresh()
    actions.fetchEnvironment()
  })
</script>

<style lang="scss" scoped>
  .version-note-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    min-height: 32px;
    overflow: hidden;
  }

  .version-note-text {
    display: block;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.empty {
      opacity: 0.45;
    }
  }

  .version-note-edit {
    flex: 0 0 auto;
    opacity: 0;
    transition: opacity 0.12s ease;
  }

  .version-note-cell:hover .version-note-edit {
    opacity: 1;
  }
</style>
