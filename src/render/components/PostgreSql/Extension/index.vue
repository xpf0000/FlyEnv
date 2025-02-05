<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="php-extensions">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('php.extension') }}</span>
        </div>
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left"> </div>
              <el-button class="button" :disabled="fetching" link @click="reGetData">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': fetching }"
                ></yb-icon>
              </el-button>
            </div>
          </template>

          <template #default>
            <template v-if="PgsqlExtensionSetup.installing">
              <div class="w-full h-full overflow-hidden p-5">
                <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
              </div>
            </template>
            <el-table
              v-else
              v-loading="fetching"
              height="100%"
              :data="tableData"
              style="width: 100%"
            >
              <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
                <template #header>
                  <div class="w-p100 name-cell">
                    <span style="display: inline-flex; padding: 2px 12px">{{
                      I18nT('base.name')
                    }}</span>
                  </div>
                </template>
                <template #default="scope">
                  <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
                </template>
              </el-table-column>
              <el-table-column align="center" :label="I18nT('base.status')">
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

              <el-table-column
                width="150px"
                align="left"
                :label="I18nT('base.operation')"
                class-name="operation"
              >
                <template #default="scope">
                  <template v-if="!scope.row.installed">
                    <el-popover :show-after="600" placement="top" width="auto">
                      <template #default>
                        <span>{{ I18nT('base.install') }}</span>
                      </template>
                      <template #reference>
                        <el-button
                          :disabled="PgsqlExtensionSetup.installing"
                          type="primary"
                          link
                          :icon="Download"
                          @click="handleEdit()"
                        ></el-button>
                      </template>
                    </el-popover>
                  </template>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <template v-if="showFooter" #footer>
            <template v-if="taskEnd">
              <el-button type="primary" @click.stop="taskConfirm">{{
                I18nT('base.confirm')
              }}</el-button>
            </template>
            <template v-else>
              <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { type SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { Setup, PgsqlExtensionSetup } from './setup'
  import { Download } from '@element-plus/icons-vue'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const {
    handleEdit,
    tableData,
    reGetData,
    fetching,
    xtermDom,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel
  } = Setup(props.version)

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
