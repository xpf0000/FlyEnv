<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" title="PHP-FPM" />
      <Manager
        v-else-if="tab === 1"
        type-flag="php"
        :has-static="true"
        url="https://windows.php.net/download/"
        title="PHP"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '@/components/PHP/List.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('php-fpm')
  const tabs = [I18nT('base.service'), I18nT('base.versionManager')]
</script>
