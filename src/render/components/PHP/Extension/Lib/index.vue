<template>
  <el-table v-loading="fetching" height="100%" :data="showTableLibFilter" style="width: 100%">
    <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
      <template #header>
        <div class="w-p100 name-cell">
          <span style="display: inline-flex; padding: 2px 0">{{ I18nT('base.name') }}</span>
          <el-input v-model.trim="search" placeholder="search" clearable></el-input>
        </div>
      </template>
      <template #default="scope">
        <div style="padding: 0 0 0 24px" class="flex items-center" @click.stop="toURL(scope.row)">
          <span class="hover:text-yellow-500 px-2 py-1 cursor-pointer">{{ scope.row.name }}</span>
        </div>
      </template>
    </el-table-column>
    <el-table-column align="center" :label="I18nT('base.status')">
      <template #default="scope">
        <template v-if="PHPSetup.libExecing[scope.row.name]">
          <el-button :loading="true" link></el-button>
        </template>
        <template v-else-if="scope.row.installed">
          <el-button link type="primary" @click.stop="PHPSetup.libExec(scope.row, version)">
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
            @click.stop="PHPSetup.libExec(scope.row, version)"
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
  import { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { PHPSetup } from '@/components/PHP/store'

  const { shell } = require('@electron/remote')

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const search = ref('')

  const fetching = computed(() => {
    return PHPSetup.libFetching?.[props.version.bin] ?? false
  })

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

  const showTableLibFilter = computed(() => {
    const used = PHPSetup.localUsed?.[props.version.bin] ?? []
    let lib = PHPSetup.libExtend?.[props.version.bin] ?? []
    const phpVersion = props.version.version!.split('.').slice(0, 2).join('.')
    lib = lib.filter((l: any) => {
      return l.versions?.[phpVersion]?.length > 0
    })
    lib.forEach((l: any) => {
      l.installed = used.some((u: any) => u.name === `php_${l.name}`.toLowerCase())
    })
    if (!search.value) {
      return lib.sort(sortName).sort(sortStatus)
    }
    return lib
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const toURL = (item: any) => {
    shell.openExternal(item.url)
  }
</script>
