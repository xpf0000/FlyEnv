<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
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
      <el-table-column :label="I18nT('common.label.path')" :prop="null">
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
                @click.stop="ServiceActionStore.updatePath(scope.row, typeFlag)"
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
                @click.stop="ServiceActionStore.updatePath(scope.row, typeFlag)"
              >
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-button
              class="current-set row-hover-show"
              link
              @click.stop="ServiceActionStore.updatePath(scope.row, typeFlag)"
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
      <el-table-column
        :label="I18nT('common.label.action')"
        :prop="null"
        width="100px"
        align="center"
      >
        <template #default="scope">
          <EXT :item="scope.row" :type="typeFlag">
            <template #default>
              <slot name="operation" :row="scope.row as SoftInstalled"></slot>
            </template>
          </EXT>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { EditPen, FolderAdd } from '@element-plus/icons-vue'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { I18nT } from '@lang/index'
  import type { AllAppModule } from '@/core/type'
  import { Setup } from '@/components/ServiceManager/setup'
  import EXT from '@/components/ServiceManager/EXT/index.vue'
  import type { SoftInstalled } from '@shared/app'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
    fetchDataWhenCreate?: boolean
  }>()

  const {
    appStore,
    versions,
    editingNoteKey,
    editingNoteValue,
    noteKey,
    getNote,
    editNote,
    cancelNoteEdit,
    saveNote,
    isInEnv,
    isInAppEnv,
    openDir,
    showCustomDir,
    resetData,
    fetchData,
    fetching
  } = Setup(props.typeFlag)

  if (props?.fetchDataWhenCreate) {
    fetchData()
  }
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
