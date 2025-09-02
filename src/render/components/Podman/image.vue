<template>
  <el-table :data="images" style="width: 100%">
    <el-table-column prop="name" :label="I18nT('podman.Image')" />
    <el-table-column prop="tag" :label="I18nT('podman.Tag')" />
    <el-table-column prop="size" :label="I18nT('podman.Size')" />
    <el-table-column prop="created" :label="I18nT('podman.Created')" />
    <el-table-column :label="I18nT('podman.Action')" width="120">
      <template #default="scope">
        <el-button type="danger" size="small" @click="removeImage(scope.row)">
          {{ I18nT('podman.Delete') }}
        </el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { I18nT } from '@lang/index'
  import type { Image } from '@/components/Podman/class/Image'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const images = computed<Image[]>(() => {
    return machine?.value?.images ?? []
  })

  function removeImage(image: Image) {
    machine.value?.removeImage?.(image.id)
  }
</script>
