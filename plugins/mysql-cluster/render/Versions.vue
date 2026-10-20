<template>
  <Manager
    type-flag="mysql"
    title="MySQL"
    url="https://dev.mysql.com/downloads/mysql/"
    :has-static="true"
    :before-remove="beforeRemove"
  />
</template>
<script setup lang="ts">
  import Manager from '@/components/VersionManager/index.vue'
  import { beforeRemove } from './versionGuard'
</script>
