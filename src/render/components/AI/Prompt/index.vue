<template>
  <el-popover placement="bottom" title="AI搭档" width="auto" trigger="click">
    <template #reference>
      <el-button link>
        <Setting class="w-4 h-4" />
      </el-button>
    </template>
    <template #default>
      <el-scrollbar class="w-[640px] h-[500px] overflow-hidden">
        <div>
          <div
            class="flex justify-center items-center w-[120px] border-b-2 border-blue-500 border-solid"
          >
            自定义
          </div>
          <div class="mt-4 grid grid-cols-4 gap-4">
            <div
              class="rounded-sm border-2 border-solid border-slate-200 h-[56px] flex justify-center items-center"
            >
              <Plus class="w-4 h-4" />
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div
              class="mt-7 flex justify-center items-center w-[120px] border-b-2 border-blue-500 border-solid"
            >
              FlyEnv
            </div>
            <el-select v-model="PromptSetup.lang">
              <template v-for="(item, _index) in PromptSetup.langs" :key="_index">
                <el-option :value="item.lang" :label="item.name"></el-option>
              </template>
            </el-select>
          </div>
          <div class="mt-4 grid grid-cols-4 gap-4">
            <template v-for="(item, _index) in promptList" :key="_index">
              <div
                class="rounded-sm border-2 border-solid border-slate-200 h-[56px] flex px-3 items-center"
              >
                {{ item.name }}
              </div>
            </template>
          </div>
        </div>
      </el-scrollbar>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { Setting, Plus } from '@element-plus/icons-vue'
  import { PromptSetup, Setup } from '@/components/AI/Prompt/setup'

  const { promptList } = Setup()
</script>
