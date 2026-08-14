<template>
  <el-input v-model="content" class="rewrite-editor" type="textarea" :rows="5" />
</template>

<script lang="ts" setup>
  const content = defineModel<string>({ required: true })
</script>
