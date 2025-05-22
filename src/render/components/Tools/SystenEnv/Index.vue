<template>
  <div class="tools-system-env tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolSystemEnv') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper">
      <el-form label-position="top" class="w-full h-full overflow-hidden">
        <el-form-item label="PATH" class="h-full overflow-hidden system-env-form-item">
          <template #label>
            <div class="flex items-center">
              <span>PATH</span>
              <el-button link class="ml-2" @click.stop="toEdit('', -1)">
                <Plus class="w-5 h-5" />
              </el-button>
              <template v-if="Setup.fetchListing">
                <el-button link :loading="true"></el-button>
              </template>
              <template v-else>
                <el-button link @click.stop="Setup.fetchList()">
                  <Refresh class="w-5 h-5" />
                </el-button>
              </template>
            </div>
          </template>
          <el-auto-resizer>
            <template #default="{ height }">
              <el-table :data="Setup.list" :show-overflow-tooltip="true" :height="height">
                <el-table-column :label="I18nT('tools.envValue')">
                  <template #default="scope">
                    <el-button class="select-text" link @click.stop="pathClick(scope.row.path)">{{
                      scope.row.path
                    }}</el-button>
                  </template>
                </el-table-column>
                <el-table-column :label="I18nT('tools.rawEnvPath')">
                  <template #default="scope">
                    <el-tooltip
                      :show-after="600"
                      placement="top"
                      :disabled="!scope.row.error"
                      :content="I18nT('tools.envValueErrorTips')"
                    >
                      <el-button
                        link
                        :type="scope.row.error ? 'danger' : null"
                        @click.stop="pathClick(`echo ${scope.row.raw}`)"
                        >{{ scope.row.raw }}</el-button
                      >
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column
                  :label="I18nT('base.operation')"
                  :prop="null"
                  width="150px"
                  align="center"
                >
                  <template #default="scope">
                    <el-button
                      :class="{ 'opacity-0': scope.$index === Setup.list.length - 1 }"
                      :disabled="scope.$index === Setup.list.length - 1"
                      link
                      type="primary"
                      :icon="SortDown"
                      @click.stop="doDown(scope.row, scope.$index)"
                    ></el-button>
                    <el-button
                      :class="{ 'opacity-0': scope.$index === 0 }"
                      :disabled="scope.$index === 0"
                      link
                      type="primary"
                      :icon="SortUp"
                      @click.stop="doUp(scope.row, scope.$index)"
                    ></el-button>
                    <el-button
                      link
                      type="primary"
                      :icon="Edit"
                      @click.stop="toEdit(scope.row.path, scope.$index)"
                    ></el-button>
                    <el-popconfirm
                      :title="I18nT('base.delAlertContent')"
                      @confirm="doDel(scope.row, scope.$index)"
                    >
                      <template #reference>
                        <el-button
                          :class="{ 'opacity-0': scope.row.path.includes('%SystemRoot%') }"
                          :disabled="scope.row.path.includes('%SystemRoot%')"
                          link
                          type="danger"
                          :icon="Delete"
                        ></el-button>
                      </template>
                    </el-popconfirm>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-auto-resizer>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { Refresh, Plus, Edit, Delete, SortDown, SortUp } from '@element-plus/icons-vue'
  import { Setup } from './setup'
  import { reactive } from 'vue'
  import { ArrayMoveItem } from '@shared/utils'

  const { shell, clipboard } = require('@electron/remote')
  const { existsSync } = require('fs-extra')
  const { isAbsolute } = require('path')

  Setup.fetchList()

  const pathClick = (p: string) => {
    if (isAbsolute(p) && existsSync(p)) {
      shell.openPath(p)
      return
    }
    clipboard.writeText(p)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  let EditVM: any
  import('./edit.vue').then((res) => {
    EditVM = res.default
  })
  const toEdit = (p: string, index: number) => {
    AsyncComponentShow(EditVM, {
      item: p,
      index
    }).then((res: any) => {
      console.log('res: ', res)
      if (index < 0) {
        Setup.list.unshift(
          reactive({
            path: res.path,
            raw: res.raw,
            error: false
          })
        )
      } else {
        Setup.list.splice(
          index,
          1,
          reactive({
            path: res.path,
            raw: res.raw,
            error: false
          })
        )
      }
      const arr = Setup.list.map((p) => p.path)
      Setup.updatePath(arr)
    })
  }

  const doDel = (item: any, index: number) => {
    Setup.list.splice(index, 1)
    const arr = Setup.list.map((p) => p.path)
    Setup.updatePath(arr)
  }

  const doDown = (item: any, index: number) => {
    const arr = ArrayMoveItem(Setup.list, index, index + 1)
    Setup.list.splice(0)
    Setup.list.push(...arr)
    const list = Setup.list.map((p) => p.path)
    Setup.updatePath(list)
  }

  const doUp = (item: any, index: number) => {
    const arr = ArrayMoveItem(Setup.list, index, index - 1)
    Setup.list.splice(0)
    Setup.list.push(...arr)
    const list = Setup.list.map((p) => p.path)
    Setup.updatePath(list)
  }
</script>
<style lang="scss">
  .system-env-form-item {
    display: flex;
    flex-direction: column;

    .el-form-item__label {
      flex-shrink: 0;
    }
    .el-form-item__content {
      flex: 1;
      overflow: hidden;

      > .el_table {
        height: 100%;
        overflow: hidden;
      }
    }
  }
</style>
