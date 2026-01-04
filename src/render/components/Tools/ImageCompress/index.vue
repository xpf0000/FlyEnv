<!-- ImageCompressConfig.vue 主组件 -->
<template>
  <div class="image-compress-config">
    <el-tabs v-model="activeTab" type="border-card" class="config-tabs el-tabs-content-flex-1">
      <el-tab-pane label="基础配置" name="basic">
        <el-scrollbar>
          <BasicConfig />
        </el-scrollbar>
      </el-tab-pane>
      <el-tab-pane label="压缩配置" name="compress">
        <el-scrollbar>
          <CompressConfig />
        </el-scrollbar>
      </el-tab-pane>
      <el-tab-pane label="图片效果" name="effects">
        <el-scrollbar>
          <EffectsConfig />
        </el-scrollbar>
      </el-tab-pane>
      <el-tab-pane label="水印配置" name="watermark">
        <el-scrollbar>
          <WatermarkConfig />
        </el-scrollbar>
      </el-tab-pane>
      <el-tab-pane label="纹理配置" name="texture">
        <el-scrollbar>
          <TextureConfig />
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import BasicConfig from './BasicConfig.vue'
  import CompressConfig from './CompressConfig.vue'
  import EffectsConfig from './EffectsConfig.vue'
  import WatermarkConfig from './WatermarkConfig.vue'
  import TextureConfig from './TextureConfig.vue'

  const activeTab = ref('basic')
</script>

<style scoped>
  .config-tabs {
    @apply shadow-md;
  }

  :deep(.el-tabs__content) {
    @apply p-6;
  }
</style>
