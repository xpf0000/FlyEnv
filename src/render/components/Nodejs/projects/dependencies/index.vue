<template>
  <el-card header="dependencies">
    <template #header>
      <div class="flex items-center gap-4">
        <span>dependencies</span>
        <el-button-group size="small">
          <el-button
            size="small"
            :disabled="checking"
            :loading="checking"
            plain
            @click.stop="doCheck"
            >{{ I18nT('nodejs.checkPackageJsonUpdate') }}</el-button
          >
          <el-popconfirm :title="I18nT('nodejs.updatePackageJsonFileTips')" @confirm="doUpdate">
            <template #reference>
              <el-button :disabled="updateDisabled" :loading="updating" size="small" plain>{{
                I18nT('nodejs.updatePackageJsonFile')
              }}</el-button>
            </template>
          </el-popconfirm>
        </el-button-group>
      </div>
    </template>
    <el-table ref="table" :show-overflow-tooltip="true" :data="dependencies" style="width: 100%">
      <el-table-column type="selection" :selectable="selectable" width="55" />
      <el-table-column prop="name" label="Package Name">
        <template #default="{ row }">
          <span
            class="truncate hover:text-yellow-500 cursor-pointer"
            @click.stop="shell.openExternal(`https://www.npmjs.com/package/${row.name}`)"
            >{{ row.name }}</span
          >
        </template>
      </el-table-column>

      <el-table-column label="Is Dev" align="center" width="140px">
        <template #default="{ row }">
          <template v-if="row.isDev">
            <el-button link>
              <Check class="w-[17px] h-[17px]" />
            </el-button>
          </template>
        </template>
      </el-table-column>

      <el-table-column label="Current Version">
        <template #default="{ row }">
          <span
            class="truncate"
            :class="{
              'text-red-500': !!updateDict?.[row.name]
            }"
            >{{ row.currentVersion }}</span
          >
        </template>
      </el-table-column>

      <el-table-column label="Latest Version" prop="latestVersion">
        <template #default="{ row }">
          <span
            class="truncate"
            :class="{
              'text-green-500': !!updateDict?.[row.name]
            }"
            >{{ updateDict?.[row.name] }}</span
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
  import { computed, ComputedRef, reactive, ref } from 'vue'
  import type { ProjectItem } from '@/components/PHP/projects/setup'
  import { Check } from '@element-plus/icons-vue'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { ElMessage } from 'element-plus'
  import type { TableInstance } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { join } from 'path-browserify'
  import { shell, fs } from '@/util/NodeFn'
  import { asyncComputed } from '@vueuse/core'

  type Dependency = {
    name: string
    currentVersion: string
    latestVersion?: string
    isDev?: boolean
  }

  const props = defineProps<{
    item: ProjectItem
  }>()
  const table = ref<TableInstance>()
  const index = ref(1)

  const packageJson = asyncComputed(async () => {
    if (index.value < 0) {
      return {}
    }
    const file = join(props.item.path, 'package.json')
    const exists = await fs.existsSync(file)
    if (exists) {
      const content = await fs.readFile(file)
      try {
        return JSON.parse(content)
      } catch {
        /* empty */
      }
    }
    return {}
  })

  const updateDict = ref<Record<string, string>>({})

  const dependencies: ComputedRef<Dependency[]> = computed(() => {
    const list = packageJson?.value?.dependencies ?? []
    const listDev = packageJson?.value?.devDependencies ?? []
    const dList = Object.entries(list).map(([name, version]) => ({
      name,
      currentVersion: version
    })) as any
    const devList = Object.entries(listDev).map(([name, version]) => ({
      name,
      currentVersion: version,
      isDev: true
    })) as any
    return [...dList, ...devList]
  })

  const selectable = (row: Dependency) => {
    return !!updateDict?.value?.[row.name]
  }

  const checking = ref(false)

  const doCheck = () => {
    if (checking.value) {
      return
    }
    checking.value = true
    const file = join(props.item.path, 'package.json')
    const cwd = props.item.binPath || undefined
    IPC.send('app-fork:node', 'packageJsonUpdate', file, cwd).then((key: string, res: any) => {
      IPC.off(key)
      checking.value = false
      if (res?.code === 1) {
        return MessageError(res?.msg ?? '')
      }
      const json = res?.data ?? {}
      updateDict.value = reactive(json)
    })
  }

  const updating = ref(false)

  const updateDisabled = computed(() => {
    return (
      updating.value ||
      Object.keys(updateDict).length === 0 ||
      !table.value?.getSelectionRows()?.length
    )
  })
  const doUpdate = async () => {
    if (updateDisabled.value) {
      return
    }
    updating.value = true
    const selectRows: Dependency[] = table.value!.getSelectionRows()
    const file = join(props.item.path, 'package.json')
    try {
      const content = await fs.readFile(file)
      const json = JSON.parse(content)
      for (const p in json.dependencies) {
        if (updateDict?.value?.[p] && selectRows.some((s) => s.name === p)) {
          json.dependencies[p] = updateDict?.value?.[p]
          delete updateDict?.value?.[p]
        }
      }
      for (const p in json.devDependencies) {
        if (updateDict?.value?.[p] && selectRows.some((s) => s.name === p)) {
          json.devDependencies[p] = updateDict?.value?.[p]
          delete updateDict?.value?.[p]
        }
      }
      await fs.writeFile(file, JSON.stringify(json, null, 2))
      index.value += 1
    } catch (e: any) {
      ElMessage.error(e.toString)
    }
    updating.value = false
  }

  doCheck()
</script>
