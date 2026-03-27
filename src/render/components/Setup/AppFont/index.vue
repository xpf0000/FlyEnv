<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.appFont') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.appFontTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main brew-src">
    <el-select-v2
      v-model="appFont"
      :options="fontOptions"
      :placeholder="defaultFont"
      clearable
      filterable
      :height="320"
      style="width: 100%"
    >
      <template #default="{ item }">
        <div class="flex items-center gap-[16px] py-[4px] h-full">
          <span
            class="flex-1 min-w-[120px] overflow-hidden truncate"
            :style="{ fontFamily: item.value || defaultFont }"
            >{{ item.label }}</span
          >
          <span
            class="w-[80px] text-center opacity-80 overflow-hidden truncate"
            :style="{ fontFamily: item.value || defaultFont }"
            >AaBbCc</span
          >
          <span
            class="w-[80px] text-right opacity-80 overflow-hidden truncate"
            :style="{ fontFamily: item.value || defaultFont }"
            >{{ $t('base.name') }}</span
          >
        </div>
      </template>
    </el-select-v2>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AppStore } from '@/store/app'
  import Font from '@/util/Font'

  const defaultFont = ref(
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  )

  const store = AppStore()

  const fontOptions = computed(() => {
    const options = [{ label: 'Default', value: '' }]
    Font.familys.forEach((font) => {
      options.push({ label: font, value: font })
    })
    return options
  })

  const appFont = computed({
    get() {
      return store.config.setup?.appFont ?? ''
    },
    set(v: string) {
      store.config.setup.appFont = v
      store.saveConfig()
    }
  })
</script>
