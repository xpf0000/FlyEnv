<template>
  <div class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
    <template v-for="(item, index) in setting" :key="index">
      <el-card v-if="item.show !== false" :header="item.name">
        <template #header>
          <div class="flex items-center justify-between gap-2 overflow-hidden">
            <div class="flex-1 overflow-hidden flex items-center gap-0.5">
              <el-checkbox v-model="item.enable"></el-checkbox>
              <span class="truncate flex-1 select-text">{{ item.name }}</span>
            </div>
            <el-tooltip :content="item.tips()" placement="top">
              <yb-icon
                class="flex-shrink-0"
                style="opacity: 0.7"
                :svg="import('@/svg/question.svg?raw')"
                width="15"
                height="15"
              />
            </el-tooltip>
          </div>
        </template>
        <template #default>
          <template v-if="item.options">
            <el-select v-model="item.value" :disabled="!item.enable" class="w-full">
              <template v-for="(option, j) in item.options" :key="j">
                <el-option :label="option.label" :value="option.value"></el-option>
              </template>
            </el-select>
          </template>
          <template v-else>
            <el-input v-model.trim="item.value" :disabled="!item.enable"></el-input>
          </template>
        </template>
      </el-card>
    </template>
  </div>
</template>
<script lang="ts" setup>
  import type { CommonSetItem } from '@/components/Conf/setup'

  defineProps<{
    setting: CommonSetItem[]
  }>()
</script>
