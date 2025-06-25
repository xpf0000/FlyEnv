<template>
  <el-container id="container" class="overflow-hidden h-screen">
    <Aside />
    <router-view />
  </el-container>
</template>

<script lang="ts" setup>
  import Aside from '@/components/Aside/Index.vue'
</script>
