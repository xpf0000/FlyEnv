<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <el-radio-group v-model="filepath">
            <template v-for="(item, _index) in configs" :key="_index">
              <el-radio-button :value="item.path" :label="item.name"></el-radio-button>
            </template>
          </el-radio-group>
          <el-button link :disabled="OpenCodeSetup.loading" @click="OpenCodeSetup.init()">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="w-[24px] h-[24px]"
              :class="{ 'fa-spin': OpenCodeSetup.loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <template #default>
        <ConfVM
          :key="filepath"
          ref="conf"
          class="h-full overflow-hidden"
          :type-flag="'openCode'"
          :show-load-default="false"
          :file="filepath"
          :file-ext="'json'"
          :config-language="'json'"
          :show-commond="false"
        ></ConfVM>
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf"></ToolVM>
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import { OpenCodeSetup } from '@/components/OpenCode/setup'

  const conf = ref()

  const configs = computed(() => {
    return Object.entries(OpenCodeSetup.configPaths).map(([name, path]) => ({ name, path }))
  })

  const filepath = computed({
    get() {
      return OpenCodeSetup.confTab
    },
    set(value) {
      OpenCodeSetup.confTab = value
    }
  })

  watch(
    configs,
    (val) => {
      if (val.length > 0 && !filepath.value) {
        filepath.value = val[0].path
      }
    },
    { immediate: true }
  )
</script>
