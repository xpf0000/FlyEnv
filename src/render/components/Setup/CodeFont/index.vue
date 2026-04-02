<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ $t('setup.codeFont') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ $t('setup.codeFontTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main brew-src">
    <el-select-v2
      v-model="codeFont"
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

  const defaultFont = ref('Menlo, Monaco, "Courier New", monospace')

  const store = AppStore()

  const fontOptions = computed(() => {
    const options = [{ label: 'Default', value: '' }]
    Font.familys.forEach((font) => {
      options.push({ label: font, value: font })
    })
    return options
  })

  const codeFont = computed({
    get() {
      return store.config.setup?.codeFont ?? ''
    },
    set(v: string) {
      store.config.setup.codeFont = v
      store.saveConfig()
    }
  })
</script>
