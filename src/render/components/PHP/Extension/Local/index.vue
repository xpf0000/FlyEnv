<template>
  <el-table v-loading="fetching" height="100%" :data="showTableDataFilter" style="width: 100%">
    <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
      <template #header>
        <div class="w-p100 name-cell">
          <span style="display: inline-flex; padding: 2px 0">{{ I18nT('base.name') }}</span>
          <el-input v-model.trim="search" placeholder="search" clearable></el-input>
        </div>
      </template>
      <template #default="scope">
        <div style="padding: 0 0 0 24px" class="flex items-center" @click.stop="showDLL(scope.row)">
          <span class="hover:text-yellow-500 px-2 py-1 cursor-pointer">{{ scope.row.name }}</span>
        </div>
      </template>
    </el-table-column>
    <el-table-column align="center" :label="I18nT('base.status')">
      <template #default="scope">
        <template v-if="PHPSetup.localExecing[scope.row.name]">
          <el-button :loading="true" link></el-button>
        </template>
        <template v-else-if="scope.row.installed">
          <el-button link type="primary" @click.stop="PHPSetup.localExec(scope.row, version)">
            <yb-icon
              style="padding: 6px"
              :svg="import('@/svg/select.svg?raw')"
              width="29"
              height="29"
            />
          </el-button>
        </template>
        <template v-else>
          <el-button
            link
            class="php-extension-nouse-btn"
            @click.stop="PHPSetup.localExec(scope.row, version)"
          >
            <yb-icon
              style="padding: 6px"
              :svg="import('@/svg/select.svg?raw')"
              width="29"
              height="29"
            />
          </el-button>
        </template>
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import type { SoftInstalled } from '@shared/app'
  import { I18nT } from '@lang/index'
  import { PHPSetup } from '@/components/PHP/store'
  import { fs, shell } from '@/util/NodeFn'
  import { join } from '@/util/path-browserify'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const search = ref('')
  const installExtensionDir = ref('')

  const fetching = computed(() => {
    return PHPSetup.localFetching?.[props.version.bin] ?? false
  })

  console.log('extend version: ', props.version)

  const sortName = (a: any, b: any) => {
    return a.name.toLowerCase() - b.name.toLowerCase()
  }
  const sortStatus = (a: any, b: any) => {
    if (a.installed === b.installed) {
      return 0
    }
    if (a.installed) {
      return -1
    }
    if (b.installed) {
      return 1
    }
    return 0
  }

  const showTableDataFilter = computed(() => {
    const used = PHPSetup.localUsed?.[props.version.bin] ?? []
    const local = PHPSetup.localExtend?.[props.version.bin] ?? []
    local.forEach((l: any) => {
      l.installed = used.some((u: any) => u.name === l.name)
    })
    if (!search.value) {
      return local.sort(sortName).sort(sortStatus)
    }
    return local
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const showDLL = (item: any) => {
    if (!installExtensionDir?.value) {
      return
    }
    const dll = join(installExtensionDir?.value, `${item.name}.dll`)
    fs.existsSync(dll).then((exists) => {
      if (exists) {
        shell.showItemInFolder(dll)
      }
    })
  }

  PHPSetup.fetchLocal(props.version as any)
</script>
