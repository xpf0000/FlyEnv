<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <el-button size="small" class="flex-shrink-0" @click="addCompose()">
      {{ I18nT('base.add') }}
    </el-button>
    <el-table border class="flex-1 overflow-hidden" :data="composeList" style="width: 100%">
      <el-table-column prop="name" :label="I18nT('base.name')" />
      <el-table-column prop="path" :label="I18nT('base.path')" />
      <el-table-column prop="running" :label="I18nT('podman.Status')" width="80">
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
          <el-tag :type="scope.row.running ? 'success' : 'info'">
            {{ scope.row.running ? I18nT('podman.Running') : I18nT('podman.Stopped') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('podman.Action')" width="180">
        <template #default="scope">
          <el-button
            v-if="!scope.row.running"
            type="primary"
            size="small"
            @click="scope.row.start()"
          >
            {{ I18nT('podman.Start') }}
          </el-button>
          <el-button v-if="scope.row.running" type="warning" size="small" @click="scope.row.stop()">
            {{ I18nT('podman.Stop') }}
          </el-button>
          <el-button type="danger" size="small" @click="removeCompose(scope.row)">
            {{ I18nT('podman.Delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { I18nT } from '@lang/index'
  import type { Compose } from '@/components/Podman/class/Compose'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { Warning } from '@element-plus/icons-vue'

  const composeList = computed<Compose[]>(() => PodmanManager.compose ?? [])

  function removeCompose(compose: Compose) {
    PodmanManager.removeCompose(compose)
  }

  let ComposeAddVM: any
  import('./composeAdd.vue').then((res) => {
    ComposeAddVM = res.default
  })

  function addCompose() {
    AsyncComponentShow(ComposeAddVM).then()
  }
</script>
