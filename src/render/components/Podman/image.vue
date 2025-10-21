<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <el-button size="small" class="flex-shrink-0" @click="addImage()">{{
      I18nT('base.add')
    }}</el-button>
    <el-table
      border
      class="flex-1 overflow-hidden"
      show-overflow-tooltip
      :data="images"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="I18nT('podman.Image')">
        <template #default="scope">
          <span
            class="truncate cursor-pointer hover:text-yellow-500"
            @click.stop="doCopy(scope.row.name)"
          >
            {{ scope.row.name }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="size" width="120px" :label="I18nT('podman.Size')">
        <template #default="scope">
          <span>{{ formatBytes(Number(scope.row.size)) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created" width="170px" :label="I18nT('podman.Created')" />
      <el-table-column :label="I18nT('podman.Action')" width="120">
        <template #default="scope">
          <el-button type="danger" size="small" @click="removeImage(scope.row)">
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
  import type { Image } from '@/components/Podman/class/Image'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'
  import { formatBytes } from '@/util'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const images = computed<Image[]>(() => {
    return machine?.value?.images ?? []
  })

  function removeImage(image: Image) {
    machine.value?.removeImage?.(image.id)
  }

  let ImageAddVM: any
  import('./imageAdd.vue').then((res) => {
    ImageAddVM = res.default
  })

  function addImage() {
    AsyncComponentShow(ImageAddVM).then()
  }

  const doCopy = (txt: string) => {
    clipboard.writeText(txt)
    MessageSuccess(I18nT('base.copySuccess'))
  }
</script>
