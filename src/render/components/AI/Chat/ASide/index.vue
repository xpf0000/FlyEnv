<template>
  <div class="flex flex-col p-4">
    <el-button>FlyEnv</el-button>
    <div
      class="pb-3 pl-1 text-sm mb-3 mt-5 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
    >
      Ollama
    </div>
    <el-collapse v-model="AISetup.collapse">
      <el-collapse-item title="Consistency" name="1"> </el-collapse-item>
    </el-collapse>
  </div>
</template>
<script lang="ts" setup>
  import { AISetup } from '@/components/AI/setup'
</script>
