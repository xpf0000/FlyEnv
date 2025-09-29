<template>
  <el-form-item label="端口映射">
    <el-input-number v-model="form.apachePort" :min="1" :max="65535" />
  </el-form-item>
  <el-form-item label="站点目录路径">
    <el-input v-model="form.localPath" placeholder="F:/www/project/public" />
  </el-form-item>
</template>
<script lang="ts" setup></script>
