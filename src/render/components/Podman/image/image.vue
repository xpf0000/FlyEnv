<template>
  <div class="w-full h-full overflow-hidden flex flex-col gap-2 items-start">
    <div class="flex items-center">
      <el-button size="small" class="flex-shrink-0" @click="addImage()">{{
        I18nT('base.add')
      }}</el-button>
      <el-button size="small" class="flex-shrink-0" @click="importImage()">
        <template #default>
          <span>{{ I18nT('base.import') }}</span>
          <template v-if="machine?.imageImporting">
            <el-button link loading></el-button>
          </template>
        </template>
      </el-button>
    </div>
    <el-table
      border
      class="flex-1 overflow-hidden"
      show-overflow-tooltip
      :data="images"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="I18nT('podman.Image')">
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
      <el-table-column prop="size" width="120px" :label="I18nT('podman.Size')">
        <template #default="scope">
          <template v-if="scope.row.pulling && !scope.row.size">
            <el-button loading link></el-button>
          </template>
          <template v-else>
            <span>{{ formatBytes(Number(scope.row.size)) }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="created" width="170px" :label="I18nT('podman.Created')" />
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
                  <el-dropdown-item @click.stop="scope.row.doExport()">
                    {{ I18nT('base.export') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click.stop="doRename(scope.row)">
                    {{ I18nT('podman.Rename') }}
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
  import type { Image } from '@/components/Podman/class/Image'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { clipboard } from '@/util/NodeFn'
  import { MessageSuccess } from '@/util/Element'
  import { formatBytes } from '@/util/Index'
  import { XTermExecCache } from '@/util/XTermExec'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const images = computed<Image[]>(() => {
    return machine?.value?.images ?? []
  })

  let ImageAddVM: any
  import('./imageAdd.vue').then((res) => {
    ImageAddVM = res.default
  })

  function addImage() {
    AsyncComponentShow(ImageAddVM).then()
  }

  const importImage = () => {
    machine.value?.imageImport?.()
  }

  const doRename = (item: Image) => {
    item.doRename().then(() => {
      machine.value?.fetchImages?.()
    })
  }

  const doCopy = (txt: string) => {
    clipboard.writeText(txt)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  const showExec = (item: Image) => {
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
