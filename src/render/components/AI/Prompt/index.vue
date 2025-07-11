<template>
  <el-popover
    :visible="poperShow"
    :teleported="false"
    placement="bottom"
    :title="I18nT('ai.AIPartner')"
    width="auto"
    trigger="click"
    @show="onPoperShow"
  >
    <template #reference>
      <el-button link>
        <yb-icon class="w-5 h-5" :svg="import('@/svg/ai.svg?raw')" />
      </el-button>
    </template>
    <template #default>
      <el-scrollbar class="w-[640px] h-[500px] overflow-hidden">
        <div class="p-2 text-sm">
          <div
            class="flex justify-center items-center w-[120px] border-b-2 border-blue-500 border-solid py-2"
          >
            {{ I18nT('ai.customer') }}
          </div>
          <div class="mt-4 grid grid-cols-4 gap-4">
            <div
              class="cursor-pointer rounded-md border border-solid border-slate-200 h-[44px] flex justify-center items-center hover:bg-slate-100 hover:text-blue-500"
              @click.stop="showAdd(undefined)"
            >
              <CirclePlus class="w-5 h-5" />
            </div>
            <template v-for="(item, _index) in PromptSetup.customPrompts" :key="_index">
              <div
                class="group relative rounded-md border border-solid border-slate-200 h-[44px] flex px-3 items-center cursor-pointer hover:bg-slate-100 hover:text-blue-500 hover:border-blue-500"
                @click.stop="usePrompt(item)"
              >
                <span class="truncate">{{ item.name }}</span>
                <div
                  class="absolute right-0 top-0 bottom-0 h-full aspect-square flex justify-center items-center"
                >
                  <el-dropdown :teleported="false" trigger="click">
                    <template #default>
                      <div
                        class="rounded-full w-7 h-7 hover:bg-slate-200 justify-center items-center flex opacity-0 group-hover:opacity-100"
                        @click.stop="onMoreClick"
                      >
                        <MoreFilled class="w-4 h-4" />
                      </div>
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item :icon="Edit" @click.stop="showAdd(item)">
                          {{ I18nT('base.edit') }}
                        </el-dropdown-item>
                        <el-dropdown-item
                          :icon="CopyDocument"
                          @click.stop="showAdd({ name: item.name, prompt: item.prompt })"
                        >
                          {{ I18nT('base.copy') }}
                        </el-dropdown-item>
                        <el-dropdown-item
                          :icon="Delete"
                          divided
                          @click.stop="PromptSetup.delCustomPrompt(item)"
                          >{{ I18nT('base.del') }}</el-dropdown-item
                        >
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
          </div>
          <div class="flex items-center justify-between mt-7">
            <div
              class="flex justify-center items-center w-[120px] border-b-2 border-blue-500 border-solid py-2"
            >
              FlyEnv
            </div>
            <el-select v-model="PromptSetup.lang" :teleported="false" class="w-32 max-w-32">
              <template v-for="(item, _index) in PromptSetup.langs" :key="_index">
                <el-option :value="item.lang" :label="item.name"></el-option>
              </template>
            </el-select>
          </div>
          <div class="mt-4 grid grid-cols-4 gap-4">
            <template v-for="(item, _index) in promptList" :key="_index">
              <div
                class="relative group rounded-md border border-solid border-slate-200 h-[44px] flex px-3 items-center cursor-pointer hover:bg-slate-100 hover:text-blue-500 hover:border-blue-500"
                @click.stop="usePrompt(item)"
              >
                <span class="truncate">{{ item.name }}</span>
                <div
                  class="absolute right-0 top-0 bottom-0 h-full aspect-square flex justify-center items-center"
                >
                  <el-dropdown :teleported="false" trigger="click">
                    <template #default>
                      <div
                        class="rounded-full w-7 h-7 hover:bg-slate-200 justify-center items-center flex opacity-0 group-hover:opacity-100"
                        @click.stop="onMoreClick"
                      >
                        <MoreFilled class="w-4 h-4" />
                      </div>
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          :icon="Edit"
                          @click.stop="showAdd({ name: item.name, prompt: item.prompt })"
                        >
                          {{ I18nT('ai.saveAsCustom') }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
          </div>
        </div>
      </el-scrollbar>
    </template>
  </el-popover>
</template>
<script lang="ts" setup>
  import { CirclePlus, MoreFilled, Edit, Delete, CopyDocument } from '@element-plus/icons-vue'
  import { PromptSetup, Setup } from '@/components/AI/Prompt/setup'
  import { I18nT } from '@lang/index'

  const onMoreClick = (e: MouseEvent) => {
    console.log('onMoreClick !!!!!')
    e.stopPropagation()
    e.preventDefault()
  }

  const { promptList, showAdd, poperShow, usePrompt, onPoperShow, onPoperHide } = Setup()
</script>
