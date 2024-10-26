<template>
  <div class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
    <template v-for="(item, index) in setting" :key="index">
      <el-card :header="item.name">
        <template #header>
          <div class="flex items-center justify-between">
            <span>{{ item.name }}</span>
            <el-tooltip :content="item.tips()" placement="top">
              <yb-icon
                style="opacity: 0.7"
                :svg="import('@/svg/question.svg?raw')"
                width="17"
                height="17"
              />
            </el-tooltip>
          </div>
        </template>
        <template v-if="item.options">
          <el-select v-model="item.value">
            <template v-for="(option, j) in item.options" :key="j">
              <el-option :label="option.label" :value="option.value"></el-option>
            </template>
          </el-select>
        </template>
        <template v-else>
          <el-input v-model.trim="item.value"></el-input>
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
