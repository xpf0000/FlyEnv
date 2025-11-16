<template>
  <el-dialog
    v-model="show"
    :title="item.name.join(', ')"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    width="600px"
    @closed="closedFn"
  >
    <div v-if="containerDetail?.Id" class="h-full overflow-hidden">
      <el-scrollbar class="h-full">
        <div class="flex flex-col gap-5">
          <!-- 基本信息 -->
          <el-descriptions
            :title="I18nT('podman.container.basicInfo')"
            border
            :column="2"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.name')">
              {{ containerDetail.Name }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.id')">
              {{ containerDetail.Id.substring(0, 12) }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.image')">
              {{ containerDetail.ImageName || containerDetail.Config.Image }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.status')">
              <el-tag :type="getStatusType(containerDetail.State.Status)">
                {{ containerDetail.State.Status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.exitCode')">
              {{ containerDetail.State.ExitCode }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.restartCount')">
              {{ containerDetail.RestartCount }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.autoRemove')">
              <el-tag :type="containerDetail.HostConfig.AutoRemove ? 'success' : 'info'">
                {{
                  containerDetail.HostConfig.AutoRemove
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.isInfra')">
              <el-tag :type="containerDetail.IsInfra ? 'warning' : 'info'">
                {{
                  containerDetail.IsInfra ? I18nT('podman.common.yes') : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 运行状态 -->
          <el-descriptions
            :title="I18nT('podman.container.runningStatus')"
            border
            :column="2"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.running')">
              <el-tag :type="containerDetail.State.Running ? 'success' : 'info'">
                {{
                  containerDetail.State.Running
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.paused')">
              <el-tag :type="containerDetail.State.Paused ? 'warning' : 'info'">
                {{
                  containerDetail.State.Paused
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.restarting')">
              <el-tag :type="containerDetail.State.Restarting ? 'warning' : 'info'">
                {{
                  containerDetail.State.Restarting
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.oomKilled')">
              <el-tag :type="containerDetail.State.OOMKilled ? 'danger' : 'info'">
                {{
                  containerDetail.State.OOMKilled
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.dead')">
              <el-tag :type="containerDetail.State.Dead ? 'danger' : 'info'">
                {{
                  containerDetail.State.Dead
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item
              v-if="containerDetail.State.Error"
              :label="I18nT('podman.container.errorMsg')"
            >
              {{ containerDetail.State.Error }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 时间信息 -->
          <el-descriptions
            :title="I18nT('podman.container.timeInfo')"
            border
            :column="2"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.createdTime')">
              {{ formatTime(containerDetail.Created) }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.startedAt')">
              {{ formatTime(containerDetail.State.StartedAt) }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.finishedAt')">
              {{ formatTime(containerDetail.State.FinishedAt) }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 端口信息 -->
          <el-descriptions
            v-if="hasPortInfo"
            :title="I18nT('podman.container.portInfo')"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item
              v-if="Object.keys(containerDetail.NetworkSettings.Ports || {}).length > 0"
              :label="I18nT('podman.container.portBindings')"
            >
              <div class="space-y-2">
                <div
                  v-for="(bindingsList, portKey) in containerDetail.NetworkSettings.Ports"
                  :key="portKey"
                  class="flex items-center space-x-4 text-sm"
                >
                  <span class="font-mono bg-gray-100 px-2 py-1 rounded">{{ portKey }}</span>
                  <span>→</span>
                  <div class="flex space-x-2">
                    <el-tag
                      v-for="binding in bindingsList"
                      :key="binding.HostPort"
                      size="small"
                      type="info"
                    >
                      {{ binding.HostIp }}:{{ binding.HostPort }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </el-descriptions-item>

            <el-descriptions-item
              v-if="Object.keys(containerDetail.Config.ExposedPorts || {}).length > 0"
              :label="I18nT('podman.container.exposedPorts')"
            >
              <div class="flex flex-wrap gap-2">
                <el-tag
                  v-for="(_, port) in containerDetail.Config.ExposedPorts"
                  :key="port"
                  size="small"
                  type="warning"
                >
                  {{ port }}
                </el-tag>
              </div>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 挂载信息 -->
          <el-descriptions
            v-if="containerDetail.Mounts?.length > 0"
            :title="I18nT('podman.container.mountInfo')"
            border
            :column="1"
            :direction="'vertical'"
          >
            <el-descriptions-item :label="I18nT('podman.container.mountPoints')">
              <div class="flex flex-col gap-3">
                <template v-for="(mount, _index) in containerDetail.Mounts" :key="_index">
                  <el-descriptions border :column="2" direction="vertical">
                    <el-descriptions-item :label="I18nT('podman.container.mountType')">
                      <el-tag size="small" class="ml-1">{{ mount.Type }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item :label="I18nT('podman.container.mountPermission')">
                      <el-tag :type="mount.RW ? 'success' : 'info'" size="small" class="ml-1">
                        {{ mount.RW ? I18nT('podman.common.yes') : I18nT('podman.common.no') }}
                      </el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item :label="I18nT('podman.container.mountPath')" :span="2">
                      <span class="font-mono text-xs ml-1"
                        >{{ mount.Source }} → {{ mount.Destination }}</span
                      >
                    </el-descriptions-item>
                  </el-descriptions>
                </template>
              </div>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 网络信息 -->
          <el-descriptions
            v-if="containerDetail.NetworkSettings?.Networks"
            :title="I18nT('podman.container.networkInfo')"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.networkConfig')">
              <div class="flex flex-col gap-3">
                <template
                  v-for="(network, name) in containerDetail.NetworkSettings.Networks"
                  :key="name"
                >
                  <el-descriptions border :column="1" direction="vertical">
                    <el-descriptions-item :label="I18nT('podman.container.networkName')">
                      <span>{{ name }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item :label="I18nT('podman.container.networkId')">
                      <span>{{ network.NetworkID }}</span>
                    </el-descriptions-item>
                  </el-descriptions>
                </template>
              </div>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 命令信息 -->
          <el-descriptions
            :title="I18nT('podman.container.commandInfo')"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.startCmd')">
              <pre class="command-pre"
                >{{ containerDetail.Path }} {{ containerDetail.Args.join(' ') }}</pre
              >
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.workDir')">
              <span class="font-mono text-sm">{{ containerDetail.Config.WorkingDir }}</span>
            </el-descriptions-item>
            <el-descriptions-item
              v-if="containerDetail.Config.Entrypoint?.length > 0"
              :label="I18nT('podman.container.entrypoint')"
            >
              <span class="font-mono text-sm">{{
                containerDetail.Config.Entrypoint.join(' ')
              }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 环境变量 -->
          <el-descriptions
            v-if="containerDetail.Config.Env.length > 0"
            :title="I18nT('podman.container.envVars')"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.environmentVars')">
              <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                <el-tag
                  v-for="env in containerDetail.Config.Env"
                  :key="env"
                  size="small"
                  type="info"
                >
                  {{ env }}
                </el-tag>
              </div>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 配置信息 -->
          <el-descriptions
            :title="I18nT('podman.container.configInfo')"
            border
            :column="2"
            direction="vertical"
          >
            <el-descriptions-item :label="I18nT('podman.container.restartPolicy')">
              {{ containerDetail.HostConfig.RestartPolicy.Name }}
              <span
                v-if="containerDetail.HostConfig.RestartPolicy.MaximumRetryCount > 0"
                class="text-gray-500 text-sm ml-1"
              >
                ({{ I18nT('podman.container.maxRetry') }}:
                {{ containerDetail.HostConfig.RestartPolicy.MaximumRetryCount }})
              </span>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.networkMode')">
              {{ containerDetail.HostConfig.NetworkMode }}
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.privilegedMode')">
              <el-tag
                :type="containerDetail.HostConfig.Privileged ? 'warning' : 'info'"
                size="small"
              >
                {{
                  containerDetail.HostConfig.Privileged
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="I18nT('podman.container.readonlyFs')">
              <el-tag
                :type="containerDetail.HostConfig.ReadonlyRootfs ? 'warning' : 'info'"
                size="small"
              >
                {{
                  containerDetail.HostConfig.ReadonlyRootfs
                    ? I18nT('podman.common.yes')
                    : I18nT('podman.common.no')
                }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-scrollbar>
    </div>

    <el-empty v-else :description="I18nT('podman.container.loading')" />

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="closedFn">{{ I18nT('podman.common.close') }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { ContainerDetail } from '@/components/Podman/type'
  import IPC from '@/util/IPC'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import type { Container } from '@/components/Podman/class/Container'
  import { I18nT } from '@lang/index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{ item: Container }>()
  const containerDetail = ref<ContainerDetail>()

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const fetchContainerInfo = () => {
    IPC.send('app-fork:podman', 'fetchContainerInfo', props.item.id, machine.value?.name).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          containerDetail.value = res.data
        }
      }
    )
  }

  fetchContainerInfo()

  const hasPortInfo = computed(() => {
    return (
      containerDetail.value &&
      (Object.keys(containerDetail.value.NetworkSettings?.Ports || {}).length > 0 ||
        Object.keys(containerDetail.value.Config.ExposedPorts || {}).length > 0)
    )
  })

  const formatTime = (timeStr: string): string => {
    if (!timeStr || timeStr.startsWith('0001-01-01')) return '-'
    try {
      return new Date(timeStr).toLocaleString()
    } catch {
      return '-'
    }
  }

  const getStatusType = (status: string): string => {
    const typeMap: Record<string, string> = {
      running: 'success',
      exited: 'info',
      created: 'primary',
      paused: 'warning',
      restarting: 'warning',
      dead: 'danger'
    }
    return typeMap[status.toLowerCase()] || 'info'
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>

<style scoped>
  .container-detail {
    max-height: 70vh;
    overflow-y: auto;
  }

  .command-pre {
    background: #f5f7fa;
    padding: 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }
</style>
