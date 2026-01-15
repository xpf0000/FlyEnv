<!-- EffectsConfig.vue 图片效果 -->
<template>
  <div class="effects-config">
    <h3 class="text-lg font-medium mb-4">{{ I18nT('tools.ImageCompress.effectsConfig.title') }}</h3>
    <div class="space-y-6">
      <!-- 旋转和翻转 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.effectsConfig.rotateFlip')
        }}</h4>
        <div class="grid grid-cols-1 gap-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.verticalFlip')
              }}</label>
              <el-switch v-model="config.flip" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.horizontalFlip')
              }}</label>
              <el-switch v-model="config.flop" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.effectsConfig.rotationAngle')
            }}</label>
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
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.effectsConfig.blurSharpen')
        }}</h4>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-1 xl:grid-cols-2">
          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.effectsConfig.blurStrength')
            }}</label>
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
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.effectsConfig.sharpenStrength')
            }}</label>
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
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.effectsConfig.colorAdjustment')
        }}</h4>
        <div class="space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.gamma')
              }}</label>
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
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.hue')
              }}</label>
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
                >{{ I18nT('tools.ImageCompress.effectsConfig.brightness') }} ({{
                  config.modulate.brightness?.toFixed(1)
                }})</label
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
                >{{ I18nT('tools.ImageCompress.effectsConfig.saturation') }} ({{
                  config.modulate.saturation?.toFixed(1)
                }})</label
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
                <label class="block text-sm font-medium"
                  >{{ I18nT('tools.ImageCompress.effectsConfig.threshold') }}
                </label>
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
                  >{{ I18nT('tools.ImageCompress.effectsConfig.opacity') }} ({{
                    config.opacity?.toFixed(1)
                  }})
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
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.effectsConfig.effects')
        }}</h4>
        <div class="space-y-3">
          <el-checkbox v-model="config.grayscale">{{
            I18nT('tools.ImageCompress.effectsConfig.grayscale')
          }}</el-checkbox>
          <el-checkbox v-model="config.negate">{{
            I18nT('tools.ImageCompress.effectsConfig.invert')
          }}</el-checkbox>
          <el-checkbox v-model="config.normalise">{{
            I18nT('tools.ImageCompress.effectsConfig.normalize')
          }}</el-checkbox>

          <div>
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.effectsConfig.colorSpace')
            }}</label>
            <el-select v-model="config.toColorspace" class="w-full">
              <el-option :label="I18nT('tools.ImageCompress.colorSpaces.srgb')" value="srgb" />
              <el-option :label="I18nT('tools.ImageCompress.colorSpaces.rgb')" value="rgb" />
              <el-option :label="I18nT('tools.ImageCompress.colorSpaces.cmyk')" value="cmyk" />
              <el-option :label="I18nT('tools.ImageCompress.colorSpaces.lab')" value="lab" />
              <el-option :label="I18nT('tools.ImageCompress.colorSpaces.bw')" value="b-w" />
            </el-select>
          </div>
        </div>
      </div>

      <!-- 去白边 -->
      <div class="border rounded-lg p-4">
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.effectsConfig.whiteEdgeRemoval')
        }}</h4>
        <div class="space-y-4">
          <el-checkbox v-model="config.trim">{{
            I18nT('tools.ImageCompress.effectsConfig.enableWhiteEdgeRemoval')
          }}</el-checkbox>
        </div>
      </div>
    </div>
    <EffectsPreview />
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'
  import EffectsPreview from '@/components/Tools/ImageCompress/EffectsPreview.vue'
  import { I18nT } from '@lang/index'

  const config = ImageCompressSetup
</script>
