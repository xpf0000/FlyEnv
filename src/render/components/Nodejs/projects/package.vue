<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title truncate">{{ title }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-hidden p-5">
        <el-scrollbar>
          <div class="flex flex-col gap-5">
            <el-card header="scripts">
              <el-table :show-overflow-tooltip="true" :data="scriptsData" style="width: 100%">
                <el-table-column prop="name" label="Script Name" width="180" />
                <el-table-column prop="command" label="Command">
                  <template #default="scope">
                    <span class="truncate">{{ scope.row.command }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="npm" width="80" align="center">
                  <template #default="{ row }">
                    <el-button
                      class="row-hover-show"
                      type="success"
                      link
                      @click="runScript('npm', row.name)"
                    >
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
            <el-card header="dependencies"></el-card>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { NodeProjectItem } from '@/components/Nodejs/projects/setup'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'

  const { join } = require('path')
  const { existsSync, readFileSync } = require('fs')

  const props = defineProps<{
    item: NodeProjectItem
  }>()

  const packageJson = computed(() => {
    const file = join(props.item.path, 'package.json')
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8')
      try {
        return JSON.parse(content)
      } catch (e) {}
    }
    return {}
  })

  const scriptsData = computed(() =>
    Object.entries(packageJson?.value?.scripts ?? {}).map(([name, command]) => ({
      name,
      command
    }))
  )

  const runScript = (packageManager: 'npm' | 'yarn' | 'pnpm', scriptName: string) => {
    let command = ''
    switch (packageManager) {
      case 'npm':
        command = `cd "${props.item.path}" && npm run ${scriptName}`
        break
      case 'yarn':
        command = `cd "${props.item.path}" && yarn ${scriptName}`
        break
      case 'pnpm':
        command = `cd "${props.item.path}" && pnpm ${scriptName}`
        break
    }

    IPC.send('app-fork:tools', 'runInTerminal', command).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? I18nT('util.toolFileTooMore'))
      }
    })

    console.log(`Running: ${command}`)
  }

  const title = computed(() => {
    return join(props.item.path, 'package.json')
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
