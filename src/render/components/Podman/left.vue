<template>
  <div
    class="overflow-hidden flex flex-col w-[220px] flex-shrink-0 px-[8px] py-[12px] bg-white dark:bg-slate-900 rounded-md"
  >
    <el-scrollbar class="flex-1 overflow-hidden">
      <div class="w-full flex flex-col gap-7">
        <div class="flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[12px]">{{ I18nT('podman.Machine') }}</span>
            <el-button link :icon="Plus" @click.stop="addMachine(undefined)"></el-button>
          </div>
          <template v-if="mechineEmpty">
            <el-empty :image-size="28"></el-empty>
          </template>
          <template v-else>
            <template v-for="(item, _index) in mechine" :key="_index">
              <div
                :class="{
                  'bg-gray-300 dark:bg-gray-700': item.name === tab,
                  'hover:bg-gray-200 dark:hover:bg-gray-800': item.name !== tab
                }"
                class="h-[32px] group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                @click.stop="PodmanManager.tabChange(item)"
              >
                <div class="flex items-center gap-3 flex-1 overflow-hidden">
                  <span class="text-[13px] truncate">{{ item.name }}</span>
                </div>
                <template v-if="!isLinux">
                  <el-dropdown trigger="click">
                    <template #default>
                      <div
                        class="h-full flex items-center justify-center flex-shrink-0"
                        @click.stop="emptyClick"
                      >
                        <div
                          class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-600"
                        >
                          <yb-icon :svg="import('@/svg/more1.svg?raw')" width="16" height="16" />
                        </div>
                      </div>
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click.stop="PodmanManager.startMachine(item.name)">
                          {{ I18nT('base.start') }}
                        </el-dropdown-item>
                        <el-dropdown-item @click.stop="PodmanManager.stopMachine(item.name)">
                          {{ I18nT('base.stop') }}
                        </el-dropdown-item>
                        <el-dropdown-item @click.stop="addMachine(item)">
                          {{ I18nT('base.edit') }}
                        </el-dropdown-item>
                        <el-dropdown-item divided @click.stop="PodmanManager.refresh()">
                          {{ I18nT('base.refresh') }}
                        </el-dropdown-item>
                        <el-dropdown-item divided @click.stop="item.remove()">
                          <span class="text-red-500">{{ I18nT('base.delete') }}</span>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </div>
            </template>
          </template>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { Delete, Edit, Folder, Plus, SetUp, Top } from '@element-plus/icons-vue'
  import CodeLibrary from '@/components/Tools/CodeLibrary/setup'
  import { I18nT } from '@lang/index'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { emptyClick } from '@/util/Index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  let MachineAddVM: any
  import('./machineAdd.vue').then((res) => {
    MachineAddVM = res.default
  })

  const addMachine = (item?: any) => {
    AsyncComponentShow(MachineAddVM, {
      item
    }).then()
  }

  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const mechineEmpty = computed(() => {
    return PodmanManager.machine.length === 0
  })

  const mechine = computed(() => {
    return PodmanManager.machine
  })

  const tab = computed({
    get() {
      return PodmanManager.tab
    },
    set(v: string) {
      PodmanManager.tab = v
    }
  })
</script>
