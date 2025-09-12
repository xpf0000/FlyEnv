<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <el-button size="small" class="flex-shrink-0" @click="addCompose(undefined)">
      {{ I18nT('base.add') }}
    </el-button>
    <el-table
      border
      class="flex-1 overflow-hidden"
      show-overflow-tooltip
      :data="composeList"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="I18nT('base.name')" width="160" />
      <el-table-column prop="path" :label="I18nT('base.path')">
        <template #default="scope">
          <span
            class="truncate hover:text-yellow-500 cursor-pointer"
            @click.stop="shell.showItemInFolder(scope.row.path)"
            >{{ scope.row.path }}</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="comment" :label="I18nT('host.comment')"></el-table-column>
      <el-table-column prop="running" :label="I18nT('podman.Status')" width="110" align="center">
        <template #default="scope">
          <template v-if="scope.row?.statusError">
            <el-tooltip :content="scope.row?.statusError">
              <Warning class="w-[21px] h-[21px] text-yellow-500" />
            </el-tooltip>
          </template>
          <template v-else-if="scope.row.run">
            <div class="service status running" :class="{ disabled: scope.row.running }">
              <yb-icon
                class="w-[21px] h-[21px]"
                :svg="import('@/svg/stop2.svg?raw')"
                @click.stop="scope.row.stop()"
              />
            </div>
          </template>
          <template v-else>
            <div class="service status" :class="{ disabled: scope.row.running }">
              <yb-icon
                class="w-[21px] h-[21px]"
                :svg="import('@/svg/play.svg?raw')"
                @click.stop="scope.row.start()"
              />
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('podman.Action')" width="100" align="center">
        <template #default="scope">
          <el-dropdown>
            <template #default>
              <el-button link class="status">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </el-button>
            </template>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click.stop="addCompose(scope.row)">
                  {{ I18nT('base.edit') }}
                </el-dropdown-item>
                <el-dropdown-item @click.stop="toEditFile(scope.row)">
                  {{ I18nT('base.edit') }} {{ basename(scope.row.path) }}
                </el-dropdown-item>
                <el-dropdown-item @click.stop="removeCompose(scope.row)">
                  {{ I18nT('podman.Delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { I18nT } from '@lang/index'
  import type { Compose } from '@/components/Podman/class/Compose'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { Warning } from '@element-plus/icons-vue'
  import { shell } from '@/util/NodeFn'
  import { basename } from '@/util/path-browserify'

  const composeList = computed<Compose[]>(() => PodmanManager.compose ?? [])

  function removeCompose(compose: Compose) {
    PodmanManager.removeCompose(compose)
  }

  let ComposeAddVM: any
  import('./composeAdd.vue').then((res) => {
    ComposeAddVM = res.default
  })

  function addCompose(item?: Compose) {
    AsyncComponentShow(ComposeAddVM, {
      item
    }).then()
  }

  const refreshState = () => {
    composeList.value.forEach((item) => {
      item.checkRunningStatus()
    })
  }

  let ConfigVM: any
  import('./config.vue').then((res) => {
    ConfigVM = res.default
  })

  const toEditFile = (item: Compose) => {
    AsyncComponentShow(ConfigVM, {
      item
    }).then()
  }

  onMounted(() => {
    refreshState()
  })
</script>
