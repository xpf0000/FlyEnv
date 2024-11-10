<template>
  <el-container id="container">
    <Aside />
    <router-view />
  </el-container>
  <FloatButton />
</template>

<script lang="ts" setup>
  import Aside from '@web/components/Aside/Index.vue'
  import FloatButton from '@web/components/FloatBtn/index.vue'
</script>
