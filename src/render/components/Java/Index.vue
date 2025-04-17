<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service
        v-if="tab === 0"
        title="JAVA"
        type-flag="java"
        :fetch-data-when-create="true"
      ></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="java"
        title="Java"
        url="https://learn.microsoft.com/en-us/java/openjdk/download"
      ></Manager>
      <Maven
        v-else-if="tab === 2"
        type-flag="maven"
        title="Maven"
        url="https://maven.apache.org/"
      />
      <ProjectIndex v-else-if="tab === 3" :title="I18nT('host.projectJava')" :type-flag="'java'">
        <template #openin="item">
          <li @click.stop="Project.openPath(item.path, 'IntelliJ')">
            <yb-icon :svg="import('@/svg/idea.svg?raw')" width="13" height="13" />
            <span class="ml-15">{{ I18nT('nodejs.openIN') }} IntelliJ IDEA</span>
          </li>
        </template>
      </ProjectIndex>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/ServiceManager/base.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import Maven from '../VersionManager/all.vue'
  import ProjectIndex from '@/components/PHP/projects/index.vue'
  import { Project } from '@/util/Project'

  const { tab } = AppModuleSetup('java')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'Maven',
    I18nT('host.projectJava')
  ]
</script>
