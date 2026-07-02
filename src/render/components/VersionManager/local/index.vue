<template>
  <div class="local-version-manager">
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
      <el-table-column :label="I18nT('common.label.path')">
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
      <el-table-column align="center" :label="I18nT('common.label.action')" width="150">
        <template #default="scope">
          <ExtSet :item="scope.row" :type="typeFlag" />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import ExtSet from '@/components/ServiceManager/EXT/index.vue'
  import { SetupAll } from './setup'
  import type { AllAppModule } from '@/core/type'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { EditPen } from '@element-plus/icons-vue'

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const {
    fetching,
    tableData,
    editingNoteKey,
    editingNoteValue,
    noteKey,
    getNote,
    editNote,
    cancelNoteEdit,
    saveNote,
    checkEnvPath,
    openDir,
    isInEnv,
    isInAppEnv,
    appStore
  } = SetupAll(props.typeFlag)
  ServiceActionStore.fetchPath()
</script>

<style lang="scss" scoped>
  .local-version-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    .service-table {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

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
