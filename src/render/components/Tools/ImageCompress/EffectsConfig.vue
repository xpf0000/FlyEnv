<!-- EffectsConfig.vue 图片效果 -->
<template>
  <div class="effects-config">
    <h3 class="text-lg font-medium mb-4 text-gray-700">图片效果</h3>
    <div class="space-y-6">
      <!-- 旋转和翻转 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">旋转和翻转</h4>
        <div class="grid grid-cols-1 gap-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">垂直翻转</label>
              <el-switch v-model="config.flip" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">水平翻转</label>
              <el-switch v-model="config.flop" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">旋转角度</label>
            <el-slider
              v-model="config.rotate"
              :min="0"
              :max="359"
              :step="1"
              show-input
              show-input-controls
            ></el-slider>
          </div>
        </div>
      </div>

      <!-- 模糊和锐化 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">模糊和锐化</h4>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-1 xl:grid-cols-2">
          <div>
            <label class="block text-sm font-medium mb-2">模糊强度 (0-100)</label>
            <el-slider
              v-model="config.blur"
              :min="0"
              :max="100"
              :step="0.1"
              :format-tooltip="(val: number) => val.toFixed(1)"
              show-input
              show-input-controls
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">锐化强度 (Sigma)</label>
            <el-slider
              v-model="config.sharpen.sigma"
              :min="0"
              :max="10"
              :step="0.1"
              :format-tooltip="(val: number) => val.toFixed(1)"
              show-input
              show-input-controls
            />
          </div>
        </div>
      </div>

      <!-- 色彩调整 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">色彩调整</h4>
        <div class="space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
            <div>
              <label class="block text-sm font-medium mb-2">Gamma 值</label>
              <el-slider
                v-model="config.gamma"
                :min="1.0"
                :max="3.0"
                :step="0.1"
                :format-tooltip="(val: number) => val.toFixed(1)"
                show-input
                show-input-controls
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">色相 (-180~180)</label>
              <el-slider
                v-model="config.modulate.hue"
                :min="-180"
                :max="180"
                :step="1"
                show-input
                show-input-controls
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
            <div>
              <label class="block text-sm font-medium mb-2"
                >亮度 ({{ config.modulate.brightness?.toFixed(1) }})</label
              >
              <el-slider
                v-model="config.modulate.brightness"
                :min="0"
                :max="3"
                :step="0.1"
                show-input
                show-input-controls
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2"
                >饱和度 ({{ config.modulate.saturation?.toFixed(1) }})</label
              >
              <el-slider
                v-model="config.modulate.saturation"
                :min="0"
                :max="3"
                :step="0.1"
                show-input
                show-input-controls
              />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <label class="block text-sm font-medium">二值化 </label>
                <el-checkbox
                  v-model="config.threshold.enabled"
                  style="margin: 0; padding: 0; height: auto"
                ></el-checkbox>
              </div>
              <el-slider
                v-model="config.threshold.value"
                :disabled="!config.threshold.enabled"
                :min="0"
                :max="255"
                :step="1"
                show-input
                show-input-controls
              />
            </div>
            <div>
              <div class="flex items-center gap-2 mb-2">
                <label class="block text-sm font-medium"
                  >透明度 ({{ config.opacity?.toFixed(1) }})
                </label>
              </div>
              <el-slider
                v-model="config.opacity"
                :min="0"
                :max="1"
                :step="0.05"
                show-input
                show-input-controls
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 特效 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">特效</h4>
        <div class="space-y-3">
          <el-checkbox v-model="config.grayscale">灰度化</el-checkbox>
          <el-checkbox v-model="config.negate">反相</el-checkbox>
          <el-checkbox v-model="config.normalise">标准化</el-checkbox>

          <div>
            <label class="block text-sm font-medium mb-2">色彩空间</label>
            <el-select v-model="config.toColorspace" class="w-full">
              <el-option label="sRGB" value="srgb" />
              <el-option label="RGB" value="rgb" />
              <el-option label="CMYK" value="cmyk" />
              <el-option label="Lab" value="lab" />
              <el-option label="黑白" value="b-w" />
            </el-select>
          </div>
        </div>
      </div>

      <!-- 去白边 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">去白边设置</h4>
        <div class="space-y-4">
          <el-checkbox v-model="config.trim">启用去白边</el-checkbox>
        </div>
      </div>
    </div>
    <EffectsPreview />
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'
  import EffectsPreview from '@/components/Tools/ImageCompress/EffectsPreview.vue'

  const config = ImageCompressSetup
</script>
