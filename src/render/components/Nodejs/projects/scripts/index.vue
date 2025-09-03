<template>
  <el-card header="scripts">
    <el-table :show-overflow-tooltip="true" :data="scriptsData" style="width: 100%">
      <el-table-column prop="name" label="Script Name" width="180" />
      <el-table-column prop="command" label="Command">
        <template #default="scope">
          <span
            class="truncate hover:text-yellow-500 cursor-pointer"
            @click.stop="Project.copyPath(scope.row.command)"
            >{{ scope.row.command }}</span
          >
        </template>
      </el-table-column>
      <el-table-column label="npm" width="80" align="center">
        <template #default="{ row }">
          <el-button class="row-hover-show" type="success" link @click="runScript('npm', row.name)">
            <yb-icon class="w-[18px] h-[18px]" :svg="import('@/svg/play.svg?raw')" />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="yarn" width="80" align="center">
        <template #default="{ row }">
          <el-button
            class="row-hover-show"
            type="success"
            link
            @click="runScript('yarn', row.name)"
          >
            <yb-icon class="w-[18px] h-[18px]" :svg="import('@/svg/play.svg?raw')" />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="pnpm" width="80" align="center">
        <template #default="{ row }">
          <el-button
            class="row-hover-show"
            type="success"
            link
            @click="runScript('pnpm', row.name)"
          >
            <yb-icon class="w-[18px] h-[18px]" :svg="import('@/svg/play.svg?raw')" />
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import type { ProjectItem } from '@/components/LanguageProjects/setup'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { Project } from '@/util/Project'

  const props = defineProps<{
    item: ProjectItem
    packageJson: any
  }>()

  const scriptsData = computed(() =>
    Object.entries(props?.packageJson?.scripts ?? {}).map(([name, command]) => ({
      name,
      command
    }))
  )

  const runScript = (packageManager: 'npm' | 'yarn' | 'pnpm', scriptName: string) => {
    let command = ''
    switch (packageManager) {
      case 'npm':
        command = `cd "${props.item.path}"; npm run ${scriptName}`
        break
      case 'yarn':
        command = `cd "${props.item.path}"; yarn ${scriptName}`
        break
      case 'pnpm':
        command = `cd "${props.item.path}"; pnpm ${scriptName}`
        break
    }

    IPC.send('app-fork:tools', 'runInTerminal', command).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? '')
      }
    })

    console.log(`Running: ${command}`)
  }
</script>
