<template>
  <el-tooltip :disabled="!disabled || !tooltip" :show-after="400" placement="right">
    <template #content>
      <div class="max-w-xs">{{ tooltip }}</div>
    </template>
    <el-switch v-bind="$attrs" :disabled="disabled" />
  </el-tooltip>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'

  // Keep switch attributes and listeners on the switch, including the sidebar's click guard.
  defineOptions({ inheritAttrs: false })
  const props = defineProps<{ disabled: boolean; disabledTooltip?: string }>()
  const tooltip = computed(() => {
    if (!props.disabled) return ''
    const text = props.disabledTooltip || I18nT('service.sidebarSwitch.busy')
    // A separately installed plugin can run on a host that predates these translations.
    return text.startsWith('service.sidebarSwitch.') ? '' : text
  })
</script>
