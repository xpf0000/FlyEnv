<!-- WatermarkConfig.vue 水印配置 -->
<template>
  <div class="watermark-config">
    <h3 class="text-lg font-medium mb-4 text-gray-700">水印配置</h3>

    <div class="space-y-6">
      <!-- 水印开关 -->
      <div>
        <el-checkbox v-model="watermark.enabled">启用水印</el-checkbox>
      </div>

      <template v-if="watermark.enabled">
        <!-- 水印类型选择 -->
        <div>
          <label class="block text-sm font-medium mb-2">水印类型</label>
          <el-radio-group v-model="watermark.type">
            <el-radio label="text">文字水印</el-radio>
            <el-radio label="image">图片水印</el-radio>
          </el-radio-group>
        </div>

        <!-- 文字水印配置 -->
        <div v-if="watermark.type === 'text'">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">水印文字</label>
              <el-input
                v-model="(watermark.content as any).text"
                placeholder="请输入水印文字"
                clearable
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">字体大小</label>
                <el-input-number
                  v-model="(watermark.content as any).fontSize"
                  :min="12"
                  :max="72"
                  :step="1"
                  controls-position="right"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">字体颜色</label>
                <el-color-picker v-model="(watermark.content as any).color" show-alpha />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div>
                <label class="block text-sm font-medium mb-2">透明度</label>
                <el-slider
                  v-model="(watermark.content as any).opacity"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                  show-input
                  :show-input-controls="false"
                />
              </div>

              <!-- 背景和阴影 -->
              <div>
                <label class="block text-sm font-medium mb-2">背景色</label>
                <el-color-picker
                  v-model="(watermark.content as any).backgroundColor"
                  show-alpha
                  :disabled="!hasBackground"
                />
                <el-checkbox v-model="hasBackground" class="ml-2">启用背景</el-checkbox>
              </div>
            </div>
          </div>
        </div>

        <!-- 图片水印配置 -->
        <div v-if="watermark.type === 'image'">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">水印图片路径</label>
              <el-input
                v-model="(watermark.content as any).imagePath"
                placeholder="请输入图片路径"
                clearable
              >
                <template #append>
                  <el-button icon="Picture" @click="selectImage" />
                </template>
              </el-input>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">宽度</label>
                <el-input v-model="(watermark.content as any).width" placeholder="100 或 50%" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">高度</label>
                <el-input v-model="(watermark.content as any).height" placeholder="100 或 50%" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">透明度</label>
              <el-slider
                v-model="(watermark.content as any).opacity"
                :min="0"
                :max="1"
                :step="0.1"
                :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                show-input
                :show-input-controls="false"
              />
            </div>
          </div>
        </div>

        <!-- 位置配置 -->
        <div class="border-t pt-4">
          <h4 class="text-md font-medium mb-3 text-gray-600">位置设置</h4>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">水平位置</label>
              <el-select v-model="watermark.position!.horizontal" class="w-full">
                <el-option label="左对齐" value="left" />
                <el-option label="居中" value="center" />
                <el-option label="右对齐" value="right" />
              </el-select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">垂直位置</label>
              <el-select v-model="watermark.position!.vertical" class="w-full">
                <el-option label="顶部" value="top" />
                <el-option label="居中" value="middle" />
                <el-option label="底部" value="bottom" />
              </el-select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label class="block text-sm font-medium mb-2">水平偏移 (像素)</label>
              <el-input-number
                v-model="watermark.position!.offsetX"
                :min="0"
                :step="1"
                controls-position="right"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">垂直偏移 (像素)</label>
              <el-input-number
                v-model="watermark.position!.offsetY"
                :min="0"
                :step="1"
                controls-position="right"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- 重复模式 -->
        <div>
          <label class="block text-sm font-medium mb-2">重复模式</label>
          <el-select v-model="watermark.repeat" class="w-full">
            <el-option label="单水印" value="single" />
            <el-option label="重复" value="repeat" />
            <el-option label="网格" value="grid" />
          </el-select>

          <div v-if="watermark.repeat === 'grid'" class="mt-4">
            <label class="block text-sm font-medium mb-2">网格间距 (像素)</label>
            <el-input-number
              v-model="watermark.spacing"
              :min="10"
              :step="10"
              controls-position="right"
              class="w-full"
            />
          </div>
        </div>

        <!-- 全局透明度 -->
        <div>
          <label class="block text-sm font-medium mb-2">全局透明度</label>
          <el-slider
            v-model="watermark.globalOpacity"
            :min="0"
            :max="1"
            :step="0.1"
            :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
            show-input
            :show-input-controls="false"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    WatermarkConfig,
    TextWatermarkOptions
  } from '../../../../fork/module/Image/imageCompress.type'

  import ImageCompressSetup from './setup'

  const config = ImageCompressSetup

  // 确保水印配置存在
  if (!config.watermark) {
    config.watermark = {
      type: 'text',
      enabled: true,
      content: {
        text: '水印',
        fontSize: 24,
        color: '#FFFFFF',
        opacity: 0.8
      },
      position: {
        horizontal: 'right',
        vertical: 'bottom',
        offsetX: 20,
        offsetY: 20
      },
      repeat: 'single',
      spacing: 100,
      globalOpacity: 1
    }
  }

  // 计算属性获取水印配置
  const watermark = computed({
    get: () => {
      if (Array.isArray(config.watermark)) {
        return config.watermark[0] || createDefaultWatermark()
      }
      return config.watermark || createDefaultWatermark()
    },
    set: (value) => {
      config.watermark = value
    }
  })

  // 背景色启用控制
  const hasBackground = computed({
    get: () => !!(watermark.value.content as TextWatermarkOptions)?.backgroundColor,
    set: (value) => {
      if (watermark.value.type === 'text') {
        if (value) {
          ;(watermark.value.content as TextWatermarkOptions).backgroundColor = '#00000080'
        } else {
          delete (watermark.value.content as TextWatermarkOptions).backgroundColor
        }
      }
    }
  })

  function createDefaultWatermark(): WatermarkConfig {
    return {
      type: 'text',
      enabled: true,
      content: {
        text: '水印',
        fontSize: 24,
        color: '#FFFFFF',
        opacity: 0.8
      },
      position: {
        horizontal: 'right',
        vertical: 'bottom',
        offsetX: 20,
        offsetY: 20
      },
      repeat: 'single',
      spacing: 100,
      globalOpacity: 1
    }
  }

  const selectImage = () => {
    console.log('选择水印图片')
  }
</script>
