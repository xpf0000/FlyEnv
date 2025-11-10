<template>
  <el-dialog
    v-model="show"
    :title="item.name.join(', ')"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    width="700px"
    @closed="closedFn"
  >
    <div v-if="containerDetail?.Id" class="h-full overflow-hidden">
      <el-scrollbar class="h-full">
        <div class="flex flex-col gap-5">
          <!-- 基本信息 -->
          <el-descriptions title="基本信息" border :column="2" direction="vertical">
            <el-descriptions-item label="容器名称">
              {{ containerDetail.Name }}
            </el-descriptions-item>
            <el-descriptions-item label="容器ID">
              {{ containerDetail.Id.substring(0, 12) }}
            </el-descriptions-item>
            <el-descriptions-item label="镜像">
              {{ containerDetail.ImageName || containerDetail.Config.Image }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(containerDetail.State.Status)">
                {{ containerDetail.State.Status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="退出码">
              {{ containerDetail.State.ExitCode }}
            </el-descriptions-item>
            <el-descriptions-item label="重启次数">
              {{ containerDetail.RestartCount }}
            </el-descriptions-item>
            <el-descriptions-item label="自动删除">
              <el-tag :type="containerDetail.HostConfig.AutoRemove ? 'success' : 'info'">
                {{ containerDetail.HostConfig.AutoRemove ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="基础设施容器">
              <el-tag :type="containerDetail.IsInfra ? 'warning' : 'info'">
                {{ containerDetail.IsInfra ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 运行状态 -->
          <el-descriptions title="运行状态" border :column="2" direction="vertical">
            <el-descriptions-item label="运行中">
              <el-tag :type="containerDetail.State.Running ? 'success' : 'info'">
                {{ containerDetail.State.Running ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="已暂停">
              <el-tag :type="containerDetail.State.Paused ? 'warning' : 'info'">
                {{ containerDetail.State.Paused ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="重启中">
              <el-tag :type="containerDetail.State.Restarting ? 'warning' : 'info'">
                {{ containerDetail.State.Restarting ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="内存溢出">
              <el-tag :type="containerDetail.State.OOMKilled ? 'danger' : 'info'">
                {{ containerDetail.State.OOMKilled ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="已死亡">
              <el-tag :type="containerDetail.State.Dead ? 'danger' : 'info'">
                {{ containerDetail.State.Dead ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="containerDetail.State.Error" label="错误信息">
              {{ containerDetail.State.Error }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 时间信息 -->
          <el-descriptions title="时间信息" border :column="2" direction="vertical">
            <el-descriptions-item label="创建时间">
              {{ formatTime(containerDetail.Created) }}
            </el-descriptions-item>
            <el-descriptions-item label="启动时间">
              {{ formatTime(containerDetail.State.StartedAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="完成时间">
              {{ formatTime(containerDetail.State.FinishedAt) }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 端口信息 -->
          <el-descriptions
            v-if="hasPortInfo"
            title="端口信息"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item
              v-if="Object.keys(containerDetail.NetworkSettings.Ports || {}).length > 0"
              label="端口绑定"
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
              label="暴露端口"
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
            title="挂载信息"
            border
            :column="1"
            :direction="'vertical'"
          >
            <el-descriptions-item label="挂载点">
              <div class="flex flex-col gap-3">
                <template v-for="(mount, _index) in containerDetail.Mounts" :key="_index">
                  <el-descriptions border :column="2" direction="vertical">
                    <el-descriptions-item label="类型:">
                      <el-tag size="small" class="ml-1">{{ mount.Type }}</el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="权限:">
                      <el-tag :type="mount.RW ? 'success' : 'info'" size="small" class="ml-1">
                        {{ mount.RW ? '读写' : '只读' }}
                      </el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="路径:" :span="2">
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
            title="网络信息"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item label="网络配置">
              <div class="flex flex-col gap-3">
                <template
                  v-for="(network, name) in containerDetail.NetworkSettings.Networks"
                  :key="name"
                >
                  <el-descriptions border :column="1" direction="vertical">
                    <el-descriptions-item label="名称:">
                      <span>{{ name }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="ID:">
                      <span>{{ network.NetworkID }}</span>
                    </el-descriptions-item>
                  </el-descriptions>
                </template>
              </div>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 命令信息 -->
          <el-descriptions title="命令信息" border :column="1" direction="vertical">
            <el-descriptions-item label="启动命令">
              <pre class="command-pre"
                >{{ containerDetail.Path }} {{ containerDetail.Args.join(' ') }}</pre
              >
            </el-descriptions-item>
            <el-descriptions-item label="工作目录">
              <span class="font-mono text-sm">{{ containerDetail.Config.WorkingDir }}</span>
            </el-descriptions-item>
            <el-descriptions-item
              v-if="containerDetail.Config.Entrypoint?.length > 0"
              label="入口点"
            >
              <span class="font-mono text-sm">{{
                containerDetail.Config.Entrypoint.join(' ')
              }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 环境变量 -->
          <el-descriptions
            v-if="containerDetail.Config.Env.length > 0"
            title="环境变量"
            border
            :column="1"
            direction="vertical"
          >
            <el-descriptions-item label="环境变量">
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
          <el-descriptions title="配置信息" border :column="2" direction="vertical">
            <el-descriptions-item label="重启策略">
              {{ containerDetail.HostConfig.RestartPolicy.Name }}
              <span
                v-if="containerDetail.HostConfig.RestartPolicy.MaximumRetryCount > 0"
                class="text-gray-500 text-sm ml-1"
              >
                (最大重试: {{ containerDetail.HostConfig.RestartPolicy.MaximumRetryCount }})
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="网络模式">
              {{ containerDetail.HostConfig.NetworkMode }}
            </el-descriptions-item>
            <el-descriptions-item label="特权模式">
              <el-tag
                :type="containerDetail.HostConfig.Privileged ? 'warning' : 'info'"
                size="small"
              >
                {{ containerDetail.HostConfig.Privileged ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="只读根文件系统">
              <el-tag
                :type="containerDetail.HostConfig.ReadonlyRootfs ? 'warning' : 'info'"
                size="small"
              >
                {{ containerDetail.HostConfig.ReadonlyRootfs ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-scrollbar>
    </div>

    <el-empty v-else description="容器信息加载中..."></el-empty>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="closedFn">关闭</el-button>
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

  // 检查是否有端口信息
  const hasPortInfo = computed(() => {
    return (
      containerDetail.value &&
      (Object.keys(containerDetail.value.NetworkSettings?.Ports || {}).length > 0 ||
        Object.keys(containerDetail.value.Config.ExposedPorts || {}).length > 0)
    )
  })

  // 格式化时间
  const formatTime = (timeStr: string): string => {
    if (!timeStr || timeStr.startsWith('0001-01-01')) return '-'
    try {
      return new Date(timeStr).toLocaleString()
    } catch {
      return '-'
    }
  }

  // 获取状态标签类型
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
