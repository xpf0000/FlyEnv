<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config">
    <h3 class="text-lg font-medium mb-4 text-gray-700">批量处理</h3>

    <el-form label-position="top" @submit.prevent>
      <el-form-item label="保存位置">
        <el-input></el-input>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'
  import BasePreview from '@/components/Tools/ImageCompress/BasePreview.vue'

  const config = ImageCompressSetup

  const selectPath = () => {
    // 这里可以调用文件选择对话框
    console.log('选择文件路径')
  }
</script>
