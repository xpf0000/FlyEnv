<template>
  <ProjectIndex :type-flag="'node'" :title="I18nT('host.projectNode')">
    <template #operation="item">
      <li @click.stop="showPackage(item)">
        <Reading width="13" height="13" />
        <span class="ml-15">package.json</span>
      </li>
    </template>
  </ProjectIndex>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { type NodeProjectItem } from './setup'
  import { Reading } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import ProjectIndex from '@/components/PHP/projects/index.vue'

  let PackageVM: any
  import('./package.vue').then((res) => {
    PackageVM = res.default
  })

  const showPackage = (item: NodeProjectItem) => {
    AsyncComponentShow(PackageVM, {
      item
    }).then()
  }
</script>
