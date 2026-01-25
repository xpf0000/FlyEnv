<template>
  <div class="flex flex-col w-full gap-2">
    <template v-if="showVCRuntimeTips">
      <span>{{ version?.error ?? '' }}</span>
      <span>{{ I18nT('service.ErrorTips.VCRuntime.title') }}</span>
      <el-button type="primary" link @click.stop="openUrl"
        >https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170</el-button
      >
      <span>{{ I18nT('service.ErrorTips.VCRuntime.versionRelation') }}</span>
      <el-table size="small" :data="versionDicts">
        <el-table-column
          :label="I18nT('service.ErrorTips.VCRuntime.software')"
          prop="name"
          width="140"
        ></el-table-column>
        <el-table-column
          :label="I18nT('service.ErrorTips.VCRuntime.versionRange')"
          prop="version"
        ></el-table-column>
        <el-table-column
          :label="I18nT('service.ErrorTips.VCRuntime.msvsVersion')"
          prop="vcruntime"
        ></el-table-column>
      </el-table>
    </template>
    <template v-else>
      <span>{{ errorMessage }}</span>
    </template>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import type { AllAppModule } from '@/core/type'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { I18nT } from '@lang/index'
  import { shell } from '@/util/NodeFn'

  const props = defineProps<{
    typeFlag: AllAppModule
    version: ModuleInstalledItem
  }>()

  const isWindows = computed(() => {
    return window.Server.isWindows
  })

  const errorMessage = computed(() => {
    if (isWindows.value) {
      return props.version?.error
    }
    return props.version?.error ?? I18nT('base.versionErrorTips')
  })

  const showVCRuntimeTips = computed(() => {
    return isWindows.value && ['mysql', 'php', 'mariadb'].includes(props.typeFlag)
  })

  const versionDicts = computed(() => {
    if (!isWindows.value) return []
    if (props.typeFlag === 'mysql') {
      return [
        {
          name: 'MySQL',
          version: '5.6 / 5.7',
          vcruntime: 'Visual Studio 2013'
        },
        {
          name: 'MySQL',
          version: '8.0 +',
          vcruntime: 'Latest(Visual Studio 2017 +)'
        }
      ]
    }
    if (props.typeFlag === 'mariadb') {
      return [
        {
          name: 'MariaDB',
          version: '10.0 / 10.1',
          vcruntime: 'Visual Studio 2010'
        },
        {
          name: 'MariaDB',
          version: '10.2 / 10.3',
          vcruntime: 'Visual Studio 2015'
        },
        {
          name: 'MariaDB',
          version: '10.4 +',
          vcruntime: 'Latest(Visual Studio 2017 +)'
        }
      ]
    }
    if (props.typeFlag === 'php') {
      return [
        {
          name: 'PHP',
          version: '5.5 / 5.6',
          vcruntime: 'Visual Studio 2012'
        },
        {
          name: 'PHP',
          version: '7.0 - 7.3',
          vcruntime: 'Visual Studio 2015'
        },
        {
          name: 'PHP',
          version: '7.4 +',
          vcruntime: 'Latest(Visual Studio 2017 +)'
        }
      ]
    }
    return []
  })

  const openUrl = () => {
    const url =
      'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170'
    shell.openExternal(url).catch()
  }
</script>
