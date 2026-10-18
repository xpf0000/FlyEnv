<template>
  <div class="mt-6"
    ><el-divider content-position="left">{{ t('extraArguments') }}</el-divider
    ><el-input
      :model-value="modelValue"
      type="textarea"
      :rows="5"
      spellcheck="false"
      placeholder="--no-mmap"
      @update:model-value="$emit('update:modelValue', $event)"
    /><p class="settings-hint">{{ t('extraHint') }}</p></div
  >
</template>
<script lang="ts" setup>
  import { LlamaCppT as t } from '../../lang'
  defineProps<{ modelValue: string }>()
  defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
