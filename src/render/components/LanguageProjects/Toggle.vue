<template>
  <div v-if="hasRunProjects" class="language-project-toggle">
    <el-dropdown trigger="click" @command="handleCommand">
      <div class="toggle-btn" :class="{ running: isAnyRunning }">
        <yb-icon :svg="import('@/svg/play.svg?raw')" width="14" height="14" />
        <span class="ml-1 text-xs">{{ runningCount }}/{{ runner.projects.length }}</span>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="start-all" :disabled="allRunning">
            <yb-icon :svg="import('@/svg/play.svg?raw')" width="13" height="13" />
            <span class="ml-2">{{ I18nT('host.startAll') }}</span>
          </el-dropdown-item>
          <el-dropdown-item command="stop-all" :disabled="!anyRunning">
            <yb-icon :svg="import('@/svg/stop2.svg?raw')" width="13" height="13" />
            <span class="ml-2">{{ I18nT('host.stopAll') }}</span>
          </el-dropdown-item>
          <el-dropdown-item divided command="manage">
            <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
            <span class="ml-2">{{ I18nT('host.manageProjects') }}</span>
          </el-dropdown-item>
          <template v-for="project in runner.projects" :key="project.id">
            <el-dropdown-item divided :command="{ action: 'toggle', project }">
              <div class="flex items-center justify-between w-full gap-4">
                <div class="flex items-center">
                  <yb-icon
                    v-if="project.state.isRun"
                    :svg="import('@/svg/stop2.svg?raw')"
                    width="13"
                    height="13"
                    class="text-green-500"
                  />
                  <yb-icon v-else :svg="import('@/svg/play.svg?raw')" width="13" height="13" />
                  <span class="ml-2 truncate max-w-[150px]">{{ project.comment }}</span>
                </div>
                <span class="text-xs text-gray-400">{{ project.projectPort }}</span>
              </div>
            </el-dropdown-item>
          </template>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import {
    getLanguageProjectRunner,
    type LanguageProjectRunnerItem
  } from '@/core/LanguageProjectRunner'
  import Router from '@/router'
  import { AppStore } from '@/store/app'

  const props = defineProps<{
    typeFlag: string
    pagePath: string
  }>()

  const runner = getLanguageProjectRunner(props.typeFlag)
  const appStore = AppStore()

  const hasRunProjects = computed(() => runner.projects.length > 0)
  const isAnyRunning = computed(() => runner.projects.some((p) => p.state.isRun))
  const runningCount = computed(() => runner.projects.filter((p) => p.state.isRun).length)
  const allRunning = computed(() => runner.projects.every((p) => p.state.isRun))
  const anyRunning = computed(() => runner.projects.some((p) => p.state.isRun))

  const handleCommand = (
    command: string | { action: string; project: LanguageProjectRunnerItem }
  ) => {
    if (command === 'start-all') {
      runner.projects.forEach((p) => {
        if (!p.state.isRun) {
          p.start()
        }
      })
    } else if (command === 'stop-all') {
      runner.projects.forEach((p) => {
        if (p.state.isRun) {
          p.stop()
        }
      })
    } else if (command === 'manage') {
      appStore.currentPage = props.pagePath
      Router.push({ path: props.pagePath }).then()
    } else if (typeof command === 'object' && command.action === 'toggle') {
      const project = command.project
      if (project.state.isRun) {
        project.stop()
      } else {
        project.start()
      }
    }
  }
</script>

<style lang="scss">
  .language-project-toggle {
    .toggle-btn {
      display: flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--el-text-color-secondary);
      transition: all 0.3s;

      &:hover {
        background-color: var(--el-fill-color-light);
        color: var(--el-text-color-primary);
      }

      &.running {
        color: var(--el-color-success);
      }
    }
  }
</style>
