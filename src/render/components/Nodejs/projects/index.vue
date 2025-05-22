<template>
  <ProjectIndex :type-flag="'node'" :title="I18nT('host.projectNode')">
    <template #operation="{ row }">
      <li @click.stop="showPackage(row)">
        <Reading width="13" height="13" />
        <span class="ml-15">package.json</span>
      </li>
    </template>
  </ProjectIndex>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { type ProjectItem } from '@/components/PHP/projects/setup'
  import { Reading } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import ProjectIndex from '@/components/PHP/projects/index.vue'

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
