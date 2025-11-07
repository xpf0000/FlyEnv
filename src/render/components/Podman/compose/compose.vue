<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <template v-if="PodmanManager.dockerComposeExists">
      <div class="flex items-center">
        <el-button size="small" class="flex-shrink-0" @click="addCompose(undefined)">
          {{ I18nT('base.add') }}
        </el-button>
        <el-button size="small" class="flex-shrink-0" @click="buildCompose()">
          {{ I18nT('podman.Build') }}
        </el-button>
      </div>
      <el-table
        border
        class="flex-1 overflow-hidden"
        show-overflow-tooltip
        :data="composeList"
        style="width: 100%"
      >
        <el-table-column prop="name" :label="I18nT('base.name')" width="160" />
        <el-table-column prop="flag" :label="I18nT('host.projectName')" width="160" />
        <el-table-column prop="path" :label="I18nT('base.path')">
          <template #default="scope">
            <span class="truncate hover:text-yellow-500 cursor-pointer">{{
              scope.row.paths.join(' ')
            }}</span>
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
                  <el-dropdown-item v-if="scope.row.run" @click.stop="scope.row.stopWithTerminal()">
                    {{ I18nT('podman.StopWithTerminal') }}
                  </el-dropdown-item>
                  <el-dropdown-item v-else @click.stop="scope.row.startWithTerminal()">
                    {{ I18nT('podman.StartWithTerminal') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="scope.row.showLogsWithTerminal()">
                    {{ I18nT('base.log') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="addCompose(scope.row)">
                    {{ I18nT('base.edit') }}
                  </el-dropdown-item>
                  <template v-for="(f, _i) in scope.row.paths" :key="_i">
                    <el-dropdown-item @click.stop="toEditFile(f)">
                      {{ I18nT('base.edit') }} {{ basename(f) }}
                    </el-dropdown-item>
                  </template>
                  <el-dropdown-item @click.stop="removeCompose(scope.row)">
                    {{ I18nT('podman.Delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template v-else>
      <div class="w-full h-full p-8 flex flex-col justify-center items-center gap-7">
        <div>{{ I18nT('podman.DockerComposeNoExistsTips') }}</div>
        <el-button v-if="isNoWindows" type="primary" @click.stop="doInstallDockerCompose">
          <template #default>
            <span>{{ I18nT('podman.DockerComposeInstallButton') }}</span>
            <template v-if="PodmanManager.dockerComposeInstalling">
              <el-button class="ml-2" link loading></el-button>
            </template>
          </template>
        </el-button>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { I18nT } from '@lang/index'
  import type { Compose } from '@/components/Podman/class/Compose'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { Warning } from '@element-plus/icons-vue'
  import { basename } from '@/util/path-browserify'

  const isNoWindows = computed(() => {
    return !window.Server.isWindows
  })

  const composeList = computed<Compose[]>(() => PodmanManager.compose ?? [])

  function removeCompose(compose: Compose) {
    PodmanManager.removeCompose(compose)
  }

  const doInstallDockerCompose = () => {
    PodmanManager.installDockerCompose()
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

  let ComposeBuildVM: any
  import('./composeBuild.vue').then((res) => {
    ComposeBuildVM = res.default
  })

  function buildCompose() {
    AsyncComponentShow(ComposeBuildVM).then()
  }

  const refreshState = () => {
    composeList.value.forEach((item) => {
      item.checkRunningStatus()
    })
  }

  let ConfigVM: any
  import('../config.vue').then((res) => {
    ConfigVM = res.default
  })

  const toEditFile = (file: string) => {
    AsyncComponentShow(ConfigVM, {
      file
    }).then()
  }

  PodmanManager.checkIsComposeExists()

  onMounted(() => {
    refreshState()
  })
</script>
