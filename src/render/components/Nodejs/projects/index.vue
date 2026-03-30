<template>
  <ProjectIndex :type-flag="'node'" :title="I18nT('host.projectNode')">
    <template #operation="{ row }">
      <el-dropdown-item @click="showPackage(row)">
        <template #icon>
          <Reading width="13" height="13" />
        </template>
        <template #default>
          <span class="ml-3">package.json</span>
        </template>
      </el-dropdown-item>
    </template>
  </ProjectIndex>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { Reading } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import ProjectIndex from '@/components/LanguageProjects/index.vue'
  import type { ProjectItem } from '@/components/LanguageProjects/ProjectItem'

  let PackageVM: any
  import('./package.vue').then((res) => {
    PackageVM = res.default
  })

  const showPackage = (item: ProjectItem) => {
    AsyncComponentShow(PackageVM, {
      item
    }).then()
  }
</script>
