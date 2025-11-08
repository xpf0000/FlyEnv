<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <div class="flex items-center">
      <el-button size="small" class="flex-shrink-0" @click="addContainer()">
        <template #default>
          <span>{{ I18nT('base.add') }}</span>
          <template v-if="machine?.containerCreating">
            <el-button link loading></el-button>
          </template>
        </template>
      </el-button>
      <el-button size="small" class="flex-shrink-0" @click="importContainer()">
        <template #default>
          <span>{{ I18nT('base.import') }}</span>
          <template v-if="machine?.containerImporting">
            <el-button link loading></el-button>
          </template>
        </template>
      </el-button>
    </div>
    <el-table
      border
      class="flex-1 overflow-hidden"
      show-overflow-tooltip
      :data="containers"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="I18nT('podman.Container')">
        <template #default="scope">
          <el-tooltip :content="scope.row.name.join(', ')" :disabled="scope.row.name.length <= 1">
            <span
              class="truncate cursor-pointer hover:text-yellow-500"
              @click.stop="doCopy(scope.row.name?.[0] ?? scope.row.id)"
            >
              {{ scope.row.name?.[0] ?? scope.row.id }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="Image" :label="I18nT('podman.Image')">
        <template #default="scope">
          <span
            class="truncate cursor-pointer hover:text-yellow-500"
            @click.stop="doCopy(scope.row.Image)"
          >
            {{ scope.row.Image }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="running" :label="I18nT('podman.Status')" width="110" align="center">
        <template #default="scope">
          <template v-if="scope.row?.statusError">
            <el-tooltip :content="scope.row?.statusError">
              <Warning class="w-[21px] h-[21px] text-yellow-500" />
            </el-tooltip>
          </template>
          <template v-else-if="scope.row?.running">
            <el-button loading link></el-button>
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
      <el-table-column align="center" :label="I18nT('podman.Action')" width="100">
        <template #default="scope">
          <template v-if="scope.row.pulling">
            <el-button link type="warning" @click.stop="showExec(scope.row)">{{
              I18nT('base.executing')
            }}</el-button>
          </template>
          <template v-else>
            <el-dropdown>
              <template #default>
                <el-button link class="status">
                  <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                </el-button>
              </template>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="scope.row.run" @click.stop="scope.row.stopWithTerminal()">
                    {{ I18nT('podman.StopWithTerminal') }}
                  </el-dropdown-item>
                  <el-dropdown-item v-else @click.stop="scope.row.startWithTerminal()">
                    {{ I18nT('podman.StartWithTerminal') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="scope.row.showInfo()">
                    {{ I18nT('base.info') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="scope.row.showLogsWithTerminal()">
                    {{ I18nT('base.log') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="scope.row.doExport()">
                    {{ I18nT('base.export') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="scope.row.remove()">
                    {{ I18nT('podman.Delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { I18nT } from '@lang/index'
  import type { Container } from '@/components/Podman/class/Container'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'
  import { XTermExecCache } from '@/util/XTermExec'
  import { Warning } from '@element-plus/icons-vue'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const containers = computed<Container[]>(() => {
    return machine?.value?.container ?? []
  })

  let ContainerAddVM: any
  import('./containerCreate.vue').then((res) => {
    ContainerAddVM = res.default
  })

  function addContainer() {
    const id = 'FlyEnv-Podman-Container-Create'
    const xtermExec = XTermExecCache?.[id]
    if (xtermExec) {
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: xtermExec.title,
          item: xtermExec
        }).then()
      })
      return
    }
    AsyncComponentShow(ContainerAddVM).then()
  }

  const importContainer = () => {
    machine.value?.containerImport?.()
  }

  const doCopy = (txt: string) => {
    clipboard.writeText(txt)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const showExec = (item: Container) => {
    const xtermExec = XTermExecCache?.[item.id]
    if (xtermExec) {
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: xtermExec.title,
          item: xtermExec
        }).then()
      })
    }
  }
</script>
