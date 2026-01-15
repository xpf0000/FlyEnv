<!-- WatermarkConfig.vue 水印配置 -->
<template>
  <div class="watermark-config">
    <h3 class="text-lg font-medium mb-4">{{
      I18nT('tools.ImageCompress.watermarkConfig.title')
    }}</h3>

    <div class="space-y-6">
      <!-- 水印开关 -->
      <div>
        <el-checkbox v-model="watermark.enabled">{{
          I18nT('tools.ImageCompress.watermarkConfig.enableWatermark')
        }}</el-checkbox>
      </div>

      <template v-if="watermark.enabled">
        <!-- 水印类型选择 -->
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.watermarkConfig.watermarkType')
          }}</label>
          <el-radio-group v-model="watermark.type">
            <el-radio
              :label="I18nT('tools.ImageCompress.watermarkConfig.textWatermark')"
              value="text"
            >
              {{ I18nT('tools.ImageCompress.watermarkConfig.textWatermark') }}
            </el-radio>
            <el-radio
              :label="I18nT('tools.ImageCompress.watermarkConfig.imageWatermark')"
              value="image"
            >
              {{ I18nT('tools.ImageCompress.watermarkConfig.imageWatermark') }}
            </el-radio>
          </el-radio-group>
        </div>

        <!-- 文字水印配置 -->
        <div v-if="watermark.type === 'text'">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.watermarkConfig.watermarkText')
              }}</label>
              <el-input
                v-model="(watermark.content as any).text"
                :placeholder="I18nT('tools.ImageCompress.watermarkConfig.watermarkText')"
                clearable
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.fontSize')
                }}</label>
                <el-slider
                  v-model="(watermark.content as any).fontSize"
                  :min="12"
                  :max="300"
                  :step="1"
                  show-input
                  show-input-controls
                ></el-slider>
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.fontColor')
                }}</label>
                <el-color-picker v-model="(watermark.content as any).color" show-alpha />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.effectsConfig.opacity')
                }}</label>
                <el-slider
                  v-model="(watermark.content as any).opacity"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                  show-input
                  show-input-controls
                />
              </div>

              <!-- 背景和阴影 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.backgroundColor')
                }}</label>
                <el-color-picker
                  v-model="(watermark.content as any).backgroundColor"
                  show-alpha
                  :disabled="!hasBackground"
                />
                <el-checkbox v-model="hasBackground" class="ml-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.enableBackground')
                }}</el-checkbox>
              </div>
            </div>
          </div>
        </div>

        <!-- 图片水印配置 -->
        <div v-if="watermark.type === 'image'">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.watermarkConfig.watermarkImagePath')
              }}</label>
              <el-input
                v-model="(watermark.content as any).imagePath"
                :placeholder="I18nT('tools.ImageCompress.watermarkConfig.watermarkImagePath')"
                clearable
              >
                <template #append>
                  <el-button :icon="Picture" @click="selectImage" />
                </template>
              </el-input>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.width')
                }}</label>
                <el-input
                  v-model="(watermark.content as any).width"
                  :placeholder="I18nT('tools.ImageCompress.watermarkConfig.width')"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.watermarkConfig.height')
                }}</label>
                <el-input
                  v-model="(watermark.content as any).height"
                  :placeholder="I18nT('tools.ImageCompress.watermarkConfig.height')"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.opacity')
              }}</label>
              <el-slider
                v-model="(watermark.content as any).opacity"
                :min="0"
                :max="1"
                :step="0.05"
                :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                show-input
                show-input-controls
              />
            </div>
          </div>
        </div>

        <!-- 位置配置 -->
        <div class="border-t pt-4">
          <h4 class="text-md font-medium mb-3">{{
            I18nT('tools.ImageCompress.watermarkConfig.positionSettings')
          }}</h4>
          <div class="flex flex-col items-center gap-4">
            <div class="grid grid-cols-3 gap-2 w-32 h-32 rounded-[5px] overflow-hidden">
              <!-- 左上 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'left' &&
                    watermark.position!.vertical === 'top',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'left' ||
                    watermark.position!.vertical !== 'top'
                }"
                @click.stop="updatePositon('left', 'top')"
              >
                <div
                  class="absolute left-0 top-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'left' &&
                      watermark.position!.vertical === 'top',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'left' ||
                      watermark.position!.vertical !== 'top'
                  }"
                ></div>
                <div
                  class="absolute left-0 top-0 h-full w-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'left' &&
                      watermark.position!.vertical === 'top',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'left' ||
                      watermark.position!.vertical !== 'top'
                  }"
                ></div>
              </div>
              <!-- 中上 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'center' &&
                    watermark.position!.vertical === 'top',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'center' ||
                    watermark.position!.vertical !== 'top'
                }"
                @click.stop="updatePositon('center', 'top')"
              >
                <div
                  class="absolute left-0 top-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'center' &&
                      watermark.position!.vertical === 'top',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'center' ||
                      watermark.position!.vertical !== 'top'
                  }"
                ></div>
              </div>
              <!-- 右上 -->
              <div
                class="rounded-[5px] relative bg-slate-200 aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'right' &&
                    watermark.position!.vertical === 'top',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'right' ||
                    watermark.position!.vertical !== 'top'
                }"
                @click.stop="updatePositon('right', 'top')"
              >
                <div
                  class="absolute right-0 top-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'right' &&
                      watermark.position!.vertical === 'top',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'right' ||
                      watermark.position!.vertical !== 'top'
                  }"
                ></div>
                <div
                  class="absolute right-0 top-0 h-full w-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'right' &&
                      watermark.position!.vertical === 'top',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'right' ||
                      watermark.position!.vertical !== 'top'
                  }"
                ></div>
              </div>

              <!-- 左中 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'left' &&
                    watermark.position!.vertical === 'middle',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'left' ||
                    watermark.position!.vertical !== 'middle'
                }"
                @click.stop="updatePositon('left', 'middle')"
              >
                <div
                  class="absolute left-0 top-0 w-[5px] h-full rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'left' &&
                      watermark.position!.vertical === 'middle',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'left' ||
                      watermark.position!.vertical !== 'middle'
                  }"
                ></div>
              </div>
              <!-- 中心 -->
              <div
                class="rounded-[5px] border-[5px] border-solid"
                :class="{
                  'bg-blue-200 border-blue-400':
                    watermark.position!.horizontal === 'center' &&
                    watermark.position!.vertical === 'middle',
                  'bg-slate-200 hover:border-blue-300 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'center' ||
                    watermark.position!.vertical !== 'middle'
                }"
                @click.stop="updatePositon('center', 'middle')"
              ></div>
              <!-- 右中 -->
              <div
                class="rounded-[5px] relative bg-slate-200 aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'right' &&
                    watermark.position!.vertical === 'middle',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'right' ||
                    watermark.position!.vertical !== 'middle'
                }"
                @click.stop="updatePositon('right', 'middle')"
              >
                <div
                  class="absolute right-0 top-0 w-[5px] h-full rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'right' &&
                      watermark.position!.vertical === 'middle',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'right' ||
                      watermark.position!.vertical !== 'middle'
                  }"
                ></div>
              </div>

              <!-- 左下 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'left' &&
                    watermark.position!.vertical === 'bottom',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'left' ||
                    watermark.position!.vertical !== 'bottom'
                }"
                @click.stop="updatePositon('left', 'bottom')"
              >
                <div
                  class="absolute left-0 bottom-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'left' &&
                      watermark.position!.vertical === 'bottom',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'left' ||
                      watermark.position!.vertical !== 'bottom'
                  }"
                ></div>
                <div
                  class="absolute left-0 bottom-0 h-full w-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'left' &&
                      watermark.position!.vertical === 'bottom',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'left' ||
                      watermark.position!.vertical !== 'bottom'
                  }"
                ></div>
              </div>
              <!-- 中下 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'center' &&
                    watermark.position!.vertical === 'bottom',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'center' ||
                    watermark.position!.vertical !== 'bottom'
                }"
                @click.stop="updatePositon('center', 'bottom')"
              >
                <div
                  class="absolute left-0 bottom-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'center' &&
                      watermark.position!.vertical === 'bottom',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'center' ||
                      watermark.position!.vertical !== 'bottom'
                  }"
                ></div>
              </div>
              <!-- 右下 -->
              <div
                class="rounded-[5px] relative aspect-square group"
                :class="{
                  'bg-blue-200':
                    watermark.position!.horizontal === 'right' &&
                    watermark.position!.vertical === 'bottom',
                  'bg-slate-200 hover:bg-blue-100':
                    watermark.position!.horizontal !== 'right' ||
                    watermark.position!.vertical !== 'bottom'
                }"
                @click.stop="updatePositon('right', 'bottom')"
              >
                <div
                  class="absolute right-0 bottom-0 w-full h-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'right' &&
                      watermark.position!.vertical === 'bottom',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'right' ||
                      watermark.position!.vertical !== 'bottom'
                  }"
                ></div>
                <div
                  class="absolute right-0 bottom-0 h-full w-[5px] rounded-[2px]"
                  :class="{
                    'bg-blue-400':
                      watermark.position!.horizontal === 'right' &&
                      watermark.position!.vertical === 'bottom',
                    'bg-slate-400 group-hover:bg-blue-300':
                      watermark.position!.horizontal !== 'right' ||
                      watermark.position!.vertical !== 'bottom'
                  }"
                ></div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.watermarkConfig.horizontalOffset')
              }}</label>
              <el-slider
                v-model="watermark.position!.offsetX"
                :disabled="watermark.position!.horizontal === 'center'"
                :min="0"
                :step="1"
                :max="200"
                show-input
                show-input-controls
              ></el-slider>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.watermarkConfig.verticalOffset')
              }}</label>
              <el-slider
                v-model="watermark.position!.offsetY"
                :disabled="watermark.position!.vertical === 'middle'"
                :min="0"
                :step="1"
                :max="200"
                show-input
                show-input-controls
              ></el-slider>
            </div>
          </div>
        </div>

        <!-- 重复模式 -->
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.watermarkConfig.repeatMode')
          }}</label>
          <el-select v-model="watermark.repeat" class="w-full">
            <el-option
              :label="I18nT('tools.ImageCompress.watermarkConfig.single')"
              value="single"
            />
            <el-option :label="I18nT('tools.ImageCompress.watermarkConfig.grid')" value="grid" />
          </el-select>

          <div v-if="watermark.repeat === 'grid'" class="mt-4">
            <label class="block text-sm font-medium mb-2">{{
              I18nT('tools.ImageCompress.watermarkConfig.gridSpacing')
            }}</label>
            <el-input-number
              v-model="watermark.spacing"
              :min="10"
              :step="10"
              controls-position="right"
              class="w-full"
            />
          </div>
        </div>
      </template>
    </div>
    <WatermarkPreview v-if="watermark.enabled" />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    WatermarkConfig,
    TextWatermarkOptions
  } from '../../../../fork/module/Image/imageCompress.type'
  import WatermarkPreview from '@/components/Tools/ImageCompress/WatermarkPreview.vue'
  import { Picture } from '@element-plus/icons-vue'
  import ImageCompressSetup from './setup'
  import { dialog } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'

  const config = ImageCompressSetup

  // 确保水印配置存在
  if (!config.watermark) {
    config.watermark = {
      type: 'text',
      enabled: true,
      content: {
        text: I18nT('tools.ImageCompress.watermarkConfig.defaultWatermarkText'),
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
      spacing: 100
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

  const updatePositon = (h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => {
    watermark.value.position!.horizontal = h
    watermark.value.position!.vertical = v
  }

  function createDefaultWatermark(): WatermarkConfig {
    return {
      type: 'text',
      enabled: true,
      content: {
        text: I18nT('tools.ImageCompress.watermarkConfig.defaultWatermarkText'),
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
      spacing: 100
    }
  }

  const selectImage = () => {
    console.log('选择水印图片')
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles'],
        filters: [
          {
            name: 'Image Files',
            extensions: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif', 'svg']
          }
        ]
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        const content: any = watermark.value.content
        content.imagePath = path
      })
  }
</script>
