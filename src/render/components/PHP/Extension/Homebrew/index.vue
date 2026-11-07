<template>
  <div class="h-full min-h-0 flex flex-col">
    <div v-if="homebrewUpgrade.busy || homebrewUpgrade.result" class="p-4 shrink-0">
      <p>{{
        I18nT(
          homebrewUpgrade.result?.postprocessError
            ? 'versionmanager.brewPackagePartial'
            : `versionmanager.brewUpgradePhase.${homebrewUpgrade.phase}`
        )
      }}</p>
      <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs"
        >{{ homebrewUpgrade.logs
        }}{{ homebrewUpgrade.error ? `\n${homebrewUpgrade.error}` : '' }}</pre>
    </div>
    <el-table
      v-loading="fetching"
      height="100%"
      class="flex-1 min-h-0"
      :data="tableData"
      style="width: 100%"
    >
      <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('common.label.name')">
        <template #header>
          <div class="w-full name-cell">
            <span style="display: inline-flex; padding: 2px 0">{{
              I18nT('common.label.name')
            }}</span>
            <el-input
              v-model.trim="search"
              :placeholder="I18nT('common.action.search')"
              clearable
            ></el-input>
          </div>
        </template>
        <template #default="scope">
          <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('common.label.status')">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.status"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        width="150px"
        align="left"
        :label="I18nT('common.label.action')"
        class-name="operation"
      >
        <template v-if="version?.version" #default="scope">
          <template v-if="scope.row.status">
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('base.copyLink') }}</span>
              </template>
              <template #reference>
                <el-button
                  type="primary"
                  link
                  :icon="Link"
                  @click="copyLink(scope.row)"
                ></el-button>
              </template>
            </el-popover>
            <template v-if="scope.row.name === 'xdebug'">
              <el-popover :show-after="600" placement="top" width="auto">
                <template #default>
                  <span>{{ I18nT('php.copyConfTemplate') }}</span>
                </template>
                <template #reference>
                  <el-button
                    type="primary"
                    link
                    :icon="Document"
                    @click="copyXDebugTmpl(scope.row)"
                  ></el-button>
                </template>
              </el-popover>
            </template>
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('common.action.delete') }}</span>
              </template>
              <template #reference>
                <el-button type="primary" link :icon="Delete" @click="doDel(scope.row)"></el-button>
              </template>
            </el-popover>
          </template>
          <template v-else>
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>{{ I18nT('base.install') }}</span>
              </template>
              <template #reference>
                <el-button
                  :disabled="homebrewUpgrade.busy"
                  type="primary"
                  link
                  :icon="Download"
                  @click="handleEdit(scope.row)"
                ></el-button>
              </template>
            </el-popover>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { type SoftInstalled } from '@/store/brew'
  import { Setup } from '@/components/PHP/Extension/Homebrew/setup'
  import { homebrewUpgrade } from '@/components/VersionManager/brew/Controller'
  import { I18nT } from '@lang/index'
  import { Link, Document, Download, Delete } from '@element-plus/icons-vue'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { tableData, handleEdit, copyLink, copyXDebugTmpl, search, doDel, fetching } = Setup(
    props.version
  )
</script>
