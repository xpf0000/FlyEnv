<template>
  <el-card
    style="--el-card-padding: 12px 16px"
    shadow="never"
    class="app-base-el-card flex-1 overflow-hidden"
  >
    <template v-if="machine?.name" #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-7">
          <template v-if="machine.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="machine.run">
              <div class="service status running" :class="{ disabled: machine.running }">
                <yb-icon
                  class="w-[21px] h-[21px]"
                  :svg="import('@/svg/stop2.svg?raw')"
                  @click.stop="machine.stop()"
                />
              </div>
            </template>
            <div v-else class="service status" :class="{ disabled: machine.running }">
              <yb-icon
                class="w-[21px] h-[21px]"
                :svg="import('@/svg/play.svg?raw')"
                @click.stop="machine.start()"
              />
            </div>
          </template>
          <el-radio-group v-model="machine.tab" size="small">
            <el-radio-button value="Dashboard" :label="I18nT('podman.Dashboard')"></el-radio-button>
            <el-radio-button value="Compose" label="Compose"></el-radio-button>
            <el-radio-button value="Image" :label="I18nT('podman.Image')"></el-radio-button>
            <el-radio-button value="Container" :label="I18nT('podman.Container')"></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" :disabled="machine.running" link @click="refetchInfo">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon w-[24px] h-[24px]"
            :class="{ 'fa-spin': machine.running }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template #default>
      <template v-if="!machine?.name">
        <el-empty :description="I18nT('podman.machineIsEmpty')"></el-empty>
      </template>
      <template v-else-if="!machine?.run">
        <el-empty :description="I18nT('podman.machineNeedRun')"></el-empty>
      </template>
      <template v-else>
        <template v-if="machine.tab === 'Dashboard'">
          <DashboradVM />
        </template>
        <template v-else-if="machine.tab === 'Compose'">
          <ComposeVM />
        </template>
        <template v-else-if="machine.tab === 'Image'">
          <ImageVM />
        </template>
        <template v-else-if="machine.tab === 'Container'">
          <ContainerVM />
        </template>
        <!-- 其它 tab 可继续补充 -->
      </template>
    </template>
  </el-card>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { PodmanManager } from './class/Podman'
  import { I18nT } from '@lang/index'
  import DashboradVM from './dashboard.vue'
  import ImageVM from './image/image.vue'
  import ComposeVM from './compose/compose.vue'
  import ContainerVM from './container/container.vue'

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const refetchInfo = () => {
    if (!machine?.value) {
      return
    }
    if (machine?.value?.running) {
      return
    }
    machine.value.fetched = false
    machine.value.fetchInfoAndContainer()
  }
</script>
