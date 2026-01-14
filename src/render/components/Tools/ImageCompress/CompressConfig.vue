<!-- CompressConfig.vue 压缩配置 -->
<template>
  <div class="compress-config">
    <h3 class="text-lg font-medium mb-4">压缩配置</h3>

    <el-tabs v-model="formatActiveTab" type="card" class="compress-types-tabs">
      <!-- JPEG 配置 -->
      <el-tab-pane label="JPEG" name="jpeg">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.jpeg.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              show-input-controls
            />
          </div>

          <el-tooltip
            :show-after="600"
            content="先显示低质量模糊版本，然后逐渐变清晰，用户可以快速看到图片整体轮廓。文件大小大2-10%"
          >
            <el-checkbox v-model="config.jpeg.progressive">渐进式加载</el-checkbox>
          </el-tooltip>
          <el-tooltip
            :show-after="600"
            content="生成更小文件大小的 JPEG 图片，同时保持相同（或更好）的视觉质量. 比标准 JPEG 小 5-15%"
          >
            <el-checkbox v-model="config.jpeg.mozjpeg">MozJPEG 优化</el-checkbox>
          </el-tooltip>

          <div>
            <label class="block text-sm font-medium mb-2">色彩采样</label>
            <el-radio-group v-model="config.jpeg.chromaSubsampling">
              <el-tooltip :show-after="600" content="最高质量,生成的文件最大">
                <el-radio label="4:4:4">4:4:4</el-radio>
              </el-tooltip>
              <el-tooltip :show-after="600" content="可接受的视觉质量,最高的压缩率,生成的文件最小">
                <el-radio label="4:2:0">4:2:0</el-radio>
              </el-tooltip>
            </el-radio-group>
          </div>
        </div>
      </el-tab-pane>

      <!-- PNG 配置 -->
      <el-tab-pane label="PNG" name="png">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.png.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              show-input-controls
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
              show-input-controls
            />
          </div>
          <el-tooltip
            :show-after="600"
            content="PNG 压缩的重要优化，能显著减小文件大小（尤其对渐变、文字等图片）。对于大多数 PNG 图片，推荐启用此选项。"
          >
            <el-checkbox v-model="config.png.adaptiveFiltering">自适应过滤</el-checkbox>
          </el-tooltip>
          <el-tooltip
            :show-after="600"
            content="PNG 调色板模式是一种用索引代替直接颜色值的压缩技术，能显著减小文件大小，但限制颜色数量。最适合颜色简单的图形、图标、界面等，不适合照片和复杂渐变图片。"
          >
            <el-checkbox v-model="config.png.palette">调色板</el-checkbox>
          </el-tooltip>
        </div>
      </el-tab-pane>

      <!-- WebP 配置 -->
      <el-tab-pane label="WebP" name="webp">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.webp.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              show-input-controls
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
              show-input-controls
            />
          </div>
          <el-checkbox v-model="config.webp.lossless">无损压缩</el-checkbox>
          <el-checkbox v-model="config.webp.smartSubsample">智能二次采样</el-checkbox>
        </div>
      </el-tab-pane>

      <!-- AVIF 配置 -->
      <el-tab-pane label="AVIF" name="avif">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">质量 (0-100)</label>
            <el-slider
              v-model="config.avif.quality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              show-input-controls
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">编码强度 (1-9)</label>
            <el-slider
              v-model="config.avif.effort"
              :min="1"
              :max="9"
              :step="1"
              show-input
              show-input-controls
            />
          </div>
          <el-checkbox v-model="config.avif.lossless">无损压缩</el-checkbox>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 公共选项 -->
    <div class="mt-6 border-t pt-4">
      <h4 class="text-md font-medium mb-3">公共选项</h4>
      <div class="space-y-3">
        <el-tooltip
          :show-after="600"
          content="防止图片在缩小尺寸时降低质量,特别针对矢量格式（如 SVG）的转换, 可能导致小尺寸图片文件变大"
        >
          <el-checkbox v-model="config.withoutReduction">禁止缩小</el-checkbox>
        </el-tooltip>
        <el-tooltip
          :show-after="600"
          content="是否保留图片的 ICC 色彩配置文件. 这个设置直接影响图片在不同设备上的色彩准确性和一致性。如不保留，可减少0.5-5KB的生成文件大小"
        >
          <el-checkbox v-model="config.withIccProfile">保留ICC配置文件</el-checkbox>
        </el-tooltip>
        <div>
          <label class="block text-sm font-medium mb-2">内核算法</label>
          <el-select v-model="config.kernel" class="w-full">
            <el-tooltip :show-after="600" content="低质量，最求极致压缩可尝试">
              <el-option label="邻近" value="nearest" />
            </el-tooltip>
            <el-tooltip :show-after="600" content="中质量">
              <el-option label="两次线性" value="linear" />
            </el-tooltip>
            <el-tooltip
              :show-after="600"
              content="高质量，图片质量和文件大小较为均衡，大多数情况的默认选择"
            >
              <el-option label="两次立方" value="cubic" />
            </el-tooltip>
            <el-tooltip :show-after="600" content="很高质量">
              <el-option label="Lanczos 2" value="lanczos2" />
            </el-tooltip>
            <el-tooltip :show-after="600" content="最高质量，文件大小最大。">
              <el-option label="Lanczos 3" value="lanczos3" />
            </el-tooltip>
          </el-select>
        </div>
      </div>
    </div>

    <!-- 预览区域 -->
    <CompressPreview :format="formatActiveTab" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import ImageCompressSetup from './setup'
  import CompressPreview from './CompressPreview.vue'

  const config = ImageCompressSetup
  const formatActiveTab = ref('jpeg')
</script>
