<!-- CompressConfig.vue 压缩配置 -->
<template>
  <div class="compress-config">
    <h3 class="text-lg font-medium mb-4 text-gray-700">压缩配置</h3>

    <el-tabs v-model="formatActiveTab" type="card" class="format-tabs">
      <!-- JPEG 配置 -->
      <el-tab-pane label="JPEG" name="jpeg">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.jpeg.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <el-checkbox v-model="config.jpeg.progressive">渐进式加载</el-checkbox>
          <el-checkbox v-model="config.jpeg.mozjpeg">MozJPEG 优化</el-checkbox>

          <div>
            <label class="block text-sm font-medium mb-2">色彩采样</label>
            <el-radio-group v-model="config.jpeg.chromaSubsampling">
              <el-radio label="4:2:0">4:2:0</el-radio>
              <el-radio label="4:4:4">4:4:4</el-radio>
            </el-radio-group>
          </div>
        </div>
      </el-tab-pane>

      <!-- PNG 配置 -->
      <el-tab-pane label="PNG" name="png">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.png.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">压缩级别 (0-9)</label>
            <el-slider
              v-model="config.png.compressionLevel"
              :min="0"
              :max="9"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <el-checkbox v-model="config.png.adaptiveFiltering">自适应过滤</el-checkbox>
          <el-checkbox v-model="config.png.palette">调色板</el-checkbox>
        </div>
      </el-tab-pane>

      <!-- WebP 配置 -->
      <el-tab-pane label="WebP" name="webp">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.webp.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">透明度质量 (0-100)</label>
            <el-slider
              v-model="config.webp.alphaQuality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <el-checkbox v-model="config.webp.lossless">无损压缩</el-checkbox>
          <el-checkbox v-model="config.webp.smartSubsample">智能二次采样</el-checkbox>
        </div>
      </el-tab-pane>

      <!-- AVIF 配置 -->
      <el-tab-pane label="AVIF" name="avif">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.avif.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>

          <el-checkbox v-model="config.avif.lossless">无损压缩</el-checkbox>

          <div>
            <label class="block text-sm font-medium mb-2">编码强度 (1-9)</label>
            <el-slider
              v-model="config.avif.effort"
              :min="1"
              :max="9"
              :step="1"
              show-input
              :show-input-controls="false"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 公共选项 -->
    <div class="mt-6 border-t pt-4">
      <h4 class="text-md font-medium mb-3 text-gray-600">公共选项</h4>
      <div class="space-y-3">
        <el-checkbox v-model="config.withoutReduction">禁止缩小</el-checkbox>
        <el-checkbox v-model="config.withIccProfile">保留ICC配置文件</el-checkbox>

        <div>
          <label class="block text-sm font-medium mb-2">内核算法</label>
          <el-select v-model="config.kernel" class="w-full">
            <el-option label="最近邻" value="nearest" />
            <el-option label="线性" value="linear" />
            <el-option label="三次方" value="cubic" />
            <el-option label="Lanczos 3" value="lanczos3" />
            <el-option label="Lanczos 2" value="lanczos2" />
          </el-select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import ImageCompressSetup from './setup'

  const config = ImageCompressSetup
  const formatActiveTab = ref('jpeg')
</script>

<style scoped>
  .format-tabs {
    @apply shadow-sm;
  }
</style>
