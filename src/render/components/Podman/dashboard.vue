<template>
  <div class="w-full h-full overflow-hidden app-podman-dashboard">
    <el-scrollbar>
      <el-descriptions
        v-if="info"
        class="w-full overflow-hidden"
        label-width="50%"
        border
        :column="2"
        direction="vertical"
      >
        <el-descriptions-item
          class-name="w-[50%] overflow-hidden"
          :label="I18nT('podman.Machine')"
          >{{ info.Name }}</el-descriptions-item
        >
        <el-descriptions-item class-name="w-[50%] overflow-hidden" :label="I18nT('podman.State')">{{
          info.State
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.CPU')">{{
          info.Resources?.CPUs
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.Memory')"
          >{{ info.Resources?.Memory }} MB</el-descriptions-item
        >
        <el-descriptions-item :label="I18nT('podman.DiskSize')"
          >{{ info.Resources?.DiskSize }} MB</el-descriptions-item
        >
        <el-descriptions-item :label="I18nT('podman.rootful')">{{
          info.Rootful ? I18nT('podman.yes') : I18nT('podman.no')
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.userModeNetworking')">
          {{ info.UserModeNetworking ? I18nT('podman.yes') : I18nT('podman.no') }}
        </el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.rosetta')">{{
          info.Rosetta ? I18nT('podman.yes') : I18nT('podman.no')
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.Created')">{{
          info.Created
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.LastUp')">{{
          info.LastUp
        }}</el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.identityPath')">
          {{ info.SSHConfig?.IdentityPath }}
        </el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.remoteUsername')">
          {{ info.SSHConfig?.RemoteUsername }}
        </el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.SSHPort')">
          {{ info.SSHConfig?.Port }}
        </el-descriptions-item>
        <el-descriptions-item :label="I18nT('podman.PodmanSocket')">
          {{ info.ConnectionInfo?.PodmanSocket?.Path }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else :description="I18nT('podman.machineIsEmpty')" />
    </el-scrollbar>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import type { MachineItemType } from '@/components/Podman/type'
  import { I18nT } from '@lang/index'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const info = computed<MachineItemType | undefined>(() => {
    return machine?.value?.info
  })
</script>
<style lang="scss">
  .app-podman-dashboard {
    .el-descriptions {
      width: 100%;
      overflow: hidden;

      .el-descriptions__body {
        width: 100%;
        overflow: hidden;

        .el-descriptions__table {
          width: 100%;
          overflow: hidden;

          > tbody {
            width: 100%;
            overflow: hidden;
            > tr {
              width: 100%;
              overflow: hidden;

              > th,
              > td {
                width: 50%;
                overflow: hidden;
                white-space: pre-wrap;
                word-break: break-word;
              }
            }
          }
        }
      }
    }
  }
</style>
