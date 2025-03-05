<template>
  <div
    ref="aside"
    class="pt-[1px] pr-[1px] w-64 flex-shrink-0 h-full overflow-hidden dark:pt-0 dark:pr-0"
  >
    <div class="h-full overflow-hidden bg-white dark:bg-slate-900">
      <el-scrollbar>
        <div class="w-full flex flex-col p-2 pt-4 gap-3">
          <template v-if="AISetup.tab === 'flyenv'">
            <el-button round type="primary">FlyEnv</el-button>
          </template>
          <template v-else>
            <el-button round @click.stop="toChat(undefined)">FlyEnv</el-button>
          </template>
          <div
            class="pb-1 pl-1 text-sm mb-3 flex items-center justify-between mt-5 text-zinc-600 dark:text-gray-300 border-b border-zinc-200 dark:border-zinc-700"
          >
            <span> Ollama </span>
            <div class="flex justify-center items-center">
              <el-button link @click.stop="toOllamaSetup">
                <Setting class="w-5 h-5" />
              </el-button>
              <el-button type="primary" link @click.stop="startNewChat">
                <yb-icon class="w-5 h-5" :svg="import('@/svg/chat-new.svg?raw')" />
              </el-button>
            </div>
          </div>
          <div class="px-2 dark:text-[#ffffffb2]">
            <template v-for="citem in AISetup.modelChatList" :key="citem.id">
              <div
                class="p-2 cursor-pointer relative rounded-[12px] overflow-hidden model-chat-list"
                :class="{
                  active: AISetup.tab === citem.id
                }"
                @click.stop="toChat(citem as any)"
              >
                <span class="text-sm">{{ citem.title }}</span>
                <div class="right-hover"></div>
                <div class="right-tool-mask"></div>
                <el-dropdown
                  :teleported="true"
                  trigger="click"
                  class="right-tool"
                  popper-class="app-popper-z-99999"
                >
                  <template #default>
                    <div class="ds-icon" style="font-size: 16px; width: 16px; height: 16px"
                      ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          fill-rule="evenodd"
                          d="M3 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0m7 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0m7 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0"
                          clip-rule="evenodd"
                        ></path></svg
                    ></div>
                  </template>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :icon="Edit" @click.stop="editChat(citem as any)">
                        {{ I18nT('base.edit') }}
                      </el-dropdown-item>
                      <el-dropdown-item :icon="CopyDocument" @click.stop="copyChat(citem as any)">
                        {{ I18nT('base.copy') }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        :icon="Delete"
                        divided
                        @click.stop="delChat(citem as any)"
                        >{{ I18nT('base.del') }}</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { ref } from 'vue'
  import { AISetup, Setup } from '@/components/AI/setup'
  import { CopyDocument, Delete, Edit, Setting } from '@element-plus/icons-vue'
  import { I18nT } from '@shared/lang'

  const aside = ref<HTMLElement>()

  const { toChat, delChat, copyChat, editChat, startNewChat, toOllamaSetup } = Setup()
</script>
<style lang="scss">
  .app-popper-z-99999 {
    z-index: 99999 !important;
  }
  .model-chat-list {
    --ds-rgb-blue-50: 239 246 255;
    --ds-rgb-blue-100: 219 234 254;
    --dsr-side-bg-rgb: 249, 251, 255;
    --dsr-local-active-bg: rgb(var(--ds-rgb-blue-100));
    --dsr-side-bg: #f9fbff;
    --dsr-side-hover-bg-rgb: 239, 246, 255;
    --dsr-side-hover-bg: rgb(var(--ds-rgb-blue-50));

    .right-hover {
      content: '';
      pointer-events: none;
      border-top-right-radius: 12px;
      border-bottom-right-radius: 12px;
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      background: linear-gradient(
        90deg,
        rgba(var(--dsr-side-bg-rgb), 0) 0%,
        var(--dsr-side-bg) 50%,
        var(--dsr-side-bg) 100%
      );
      width: 24px;
      opacity: 0;
    }

    .right-tool-mask {
      content: '';
      pointer-events: none;
      border-top-right-radius: 12px;
      border-bottom-right-radius: 12px;
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      opacity: 0;
      width: 84px;
    }

    .right-tool {
      opacity: 0;
      z-index: 1;
      --ds-focus-ring-border-radius: 8px;
      border-radius: 8px;
      outline: none;
      justify-content: center;
      align-items: center;
      width: 24px;
      height: 24px;
      display: flex;
      position: absolute;
      top: 50%;
      right: 10px;
      transform: translateY(-50%);

      .ds-icon {
        line-height: 0;
        display: inline-flex;
      }

      &:hover {
        opacity: 1;
        background-color: var(--dsr-side-bg);
      }
    }

    &:not(.active):hover {
      background-color: var(--dsr-side-hover-bg);

      .right-hover {
        opacity: 1;
      }

      .right-tool-mask {
        background: linear-gradient(
          90deg,
          rgba(var(--dsr-side-hover-bg-rgb), 0) 0%,
          var(--dsr-side-hover-bg) 60%,
          var(--dsr-side-hover-bg) 100%
        );
        opacity: 1;
      }

      .right-tool {
        opacity: 1;
      }
    }

    &.active {
      background-color: var(--dsr-local-active-bg);

      .right-tool-mask {
        background: linear-gradient(
          90deg,
          rgba(var(--dsr-side-hover-bg-rgb), 0) 0%,
          var(--dsr-side-hover-bg) 60%,
          var(--dsr-side-hover-bg) 100%
        );
        opacity: 1;
      }

      .right-tool {
        opacity: 1;
      }
    }
  }

  .dark {
    .model-chat-list {
      --ds-rgb-blue-50: 71 85 105;
      --ds-rgb-blue-100: 51 65 85;
      --dsr-side-bg-rgb: 30, 41, 59;
      --dsr-side-bg: rgb(30 41 59 / var(--tw-bg-opacity, 1));
      --dsr-side-hover-bg-rgb: 71, 85, 105;
    }
  }
</style>
