<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button label="Podman" value="podman"></el-radio-button>
    </el-radio-group>
    <div class="main-block"> </div>
  </div>
</template>

<script lang="ts" setup>
  const tab = 'podman'
</script>
