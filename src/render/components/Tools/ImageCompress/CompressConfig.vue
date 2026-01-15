<!-- CompressConfig.vue 压缩配置 -->
<template>
  <div class="compress-config">
    <h3 class="text-lg font-medium mb-4">{{
      I18nT('tools.ImageCompress.compressConfig.title')
    }}</h3>

    <el-tabs v-model="formatActiveTab" type="card" class="compress-types-tabs">
      <!-- JPEG 配置 -->
      <el-tab-pane :label="I18nT('tools.ImageCompress.formats.jpeg')" name="jpeg">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.quality')
            }}</label>
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
            :content="I18nT('tools.ImageCompress.compressConfig.progressiveLoadingTooltip')"
          >
            <el-checkbox v-model="config.jpeg.progressive">{{
              I18nT('tools.ImageCompress.compressConfig.progressiveLoading')
            }}</el-checkbox>
          </el-tooltip>
          <el-tooltip
            :show-after="600"
            :content="I18nT('tools.ImageCompress.compressConfig.mozjpegTooltip')"
          >
            <el-checkbox v-model="config.jpeg.mozjpeg">{{
              I18nT('tools.ImageCompress.compressConfig.mozjpegOptimization')
            }}</el-checkbox>
          </el-tooltip>

          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.colorSampling')
            }}</label>
            <el-radio-group v-model="config.jpeg.chromaSubsampling">
              <el-tooltip
                :show-after="600"
                :content="I18nT('tools.ImageCompress.compressConfig.highestQuality')"
              >
                <el-radio label="4:4:4">4:4:4</el-radio>
              </el-tooltip>
              <el-tooltip
                :show-after="600"
                :content="I18nT('tools.ImageCompress.compressConfig.acceptableQuality')"
              >
                <el-radio label="4:2:0">4:2:0</el-radio>
              </el-tooltip>
            </el-radio-group>
          </div>
        </div>
      </el-tab-pane>

      <!-- PNG 配置 -->
      <el-tab-pane :label="I18nT('tools.ImageCompress.formats.png')" name="png">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.quality')
            }}</label>
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
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.compressionLevel')
            }}</label>
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
            :content="I18nT('tools.ImageCompress.compressConfig.adaptiveFilteringTooltip')"
          >
            <el-checkbox v-model="config.png.adaptiveFiltering">{{
              I18nT('tools.ImageCompress.compressConfig.adaptiveFiltering')
            }}</el-checkbox>
          </el-tooltip>
          <el-tooltip
            :show-after="600"
            :content="I18nT('tools.ImageCompress.compressConfig.paletteTooltip')"
          >
            <el-checkbox v-model="config.png.palette">{{
              I18nT('tools.ImageCompress.compressConfig.palette')
            }}</el-checkbox>
          </el-tooltip>
        </div>
      </el-tab-pane>

      <!-- WebP 配置 -->
      <el-tab-pane :label="I18nT('tools.ImageCompress.formats.webp')" name="webp">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.quality')
            }}</label>
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
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.alphaQuality')
            }}</label>
            <el-slider
              v-model="config.webp.alphaQuality"
              :min="0"
              :max="100"
              :step="1"
              show-input
              show-input-controls
            />
          </div>
          <el-checkbox v-model="config.webp.lossless">{{
            I18nT('tools.ImageCompress.compressConfig.lossless')
          }}</el-checkbox>
          <el-checkbox v-model="config.webp.smartSubsample">{{
            I18nT('tools.ImageCompress.compressConfig.smartSubsampling')
          }}</el-checkbox>
        </div>
      </el-tab-pane>

      <!-- AVIF 配置 -->
      <el-tab-pane :label="I18nT('tools.ImageCompress.formats.avif')" name="avif">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.quality')
            }}</label>
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
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.compressConfig.encodingStrength')
            }}</label>
            <el-slider
              v-model="config.avif.effort"
              :min="1"
              :max="9"
              :step="1"
              show-input
              show-input-controls
            />
          </div>
          <el-checkbox v-model="config.avif.lossless">{{
            I18nT('tools.ImageCompress.compressConfig.lossless')
          }}</el-checkbox>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 公共选项 -->
    <div class="mt-6 border-t pt-4">
      <h4 class="text-md font-medium mb-3">{{
        I18nT('tools.ImageCompress.compressConfig.commonOptions')
      }}</h4>
      <div class="space-y-3">
        <el-tooltip
          :show-after="600"
          :content="I18nT('tools.ImageCompress.compressConfig.preventReductionTooltip')"
        >
          <el-checkbox v-model="config.withoutReduction">{{
            I18nT('tools.ImageCompress.compressConfig.preventReduction')
          }}</el-checkbox>
        </el-tooltip>
        <el-tooltip
          :show-after="600"
          :content="I18nT('tools.ImageCompress.compressConfig.iccProfileTooltip')"
        >
          <el-checkbox v-model="config.withIccProfile">{{
            I18nT('tools.ImageCompress.compressConfig.preserveIccProfile')
          }}</el-checkbox>
        </el-tooltip>
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.compressConfig.kernelAlgorithm')
          }}</label>
          <el-select v-model="config.kernel" class="w-full">
            <el-tooltip
              :show-after="600"
              :content="I18nT('tools.ImageCompress.compressConfig.nearestTooltip')"
            >
              <el-option
                :label="I18nT('tools.ImageCompress.compressConfig.nearest')"
                value="nearest"
              />
            </el-tooltip>
            <el-tooltip
              :show-after="600"
              :content="I18nT('tools.ImageCompress.compressConfig.linearTooltip')"
            >
              <el-option
                :label="I18nT('tools.ImageCompress.compressConfig.linear')"
                value="linear"
              />
            </el-tooltip>
            <el-tooltip
              :show-after="600"
              :content="I18nT('tools.ImageCompress.compressConfig.cubicTooltip')"
            >
              <el-option :label="I18nT('tools.ImageCompress.compressConfig.cubic')" value="cubic" />
            </el-tooltip>
            <el-tooltip
              :show-after="600"
              :content="I18nT('tools.ImageCompress.compressConfig.lanczos2Tooltip')"
            >
              <el-option
                :label="I18nT('tools.ImageCompress.compressConfig.lanczos2')"
                value="lanczos2"
              />
            </el-tooltip>
            <el-tooltip
              :show-after="600"
              :content="I18nT('tools.ImageCompress.compressConfig.lanczos3Tooltip')"
            >
              <el-option
                :label="I18nT('tools.ImageCompress.compressConfig.lanczos3')"
                value="lanczos3"
              />
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
  import { I18nT } from '@lang/index'

  const config = ImageCompressSetup
  const formatActiveTab = ref('jpeg')
</script>
