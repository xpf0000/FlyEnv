<!-- TextureConfig.vue 纹理配置 -->
<template>
  <div class="texture-config">
    <h3 class="text-lg font-medium mb-4">{{ I18nT('tools.ImageCompress.textureConfig.title') }}</h3>

    <div class="space-y-6">
      <!-- 纹理开关 -->
      <div>
        <el-checkbox v-model="config.texture.enabled">{{
          I18nT('tools.ImageCompress.textureConfig.enableTexture')
        }}</el-checkbox>
      </div>

      <template v-if="config.texture.enabled">
        <!-- 纹理类型 -->
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.textureConfig.textureType')
          }}</label>
          <el-select v-model="config.texture.type" class="w-full" @change="onTextureTypeChange">
            <el-option :label="I18nT('tools.ImageCompress.textureConfig.grid')" value="grid" />
            <el-option :label="I18nT('tools.ImageCompress.textureConfig.dot')" value="dot" />
            <el-option :label="I18nT('tools.ImageCompress.textureConfig.line')" value="line" />
            <el-option :label="I18nT('tools.ImageCompress.textureConfig.noise')" value="noise" />
            <el-option
              :label="I18nT('tools.ImageCompress.textureConfig.customImage')"
              value="custom"
            />
          </el-select>
        </div>

        <!-- 自定义图片上传 -->
        <div v-if="config.texture.type === 'custom'">
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.textureConfig.customTextureImage')
          }}</label>
          <el-input
            v-model="config.texture.customImage"
            :placeholder="I18nT('tools.ImageCompress.preview.selectImageFile')"
            clearable
          >
            <template #append>
              <el-button :icon="Picture" @click="selectTextureImage" />
            </template>
          </el-input>
        </div>

        <!-- 纹理参数 -->
        <div class="border rounded-lg p-4">
          <h4 class="text-md font-medium mb-3">{{
            I18nT('tools.ImageCompress.textureConfig.textureParameters')
          }}</h4>

          <div class="space-y-4">
            <!-- 通用参数 -->
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.textureConfig.textureColor')
              }}</label>
              <el-color-picker v-model="config.texture.color" show-alpha />
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.effectsConfig.opacity')
              }}</label>
              <el-slider
                v-model="config.texture.opacity"
                :min="0"
                :max="1"
                :step="0.05"
                :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                show-input
                show-input-controls
              />
            </div>

            <!-- 类型特定参数 -->
            <template v-if="['grid', 'line', 'cross'].includes(config.texture.type)">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.textureConfig.lineWidth')
                }}</label>
                <el-slider
                  v-model="config.texture.lineWidth"
                  :min="1"
                  :max="20"
                  :step="1"
                  show-input
                  show-input-controls
                ></el-slider>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.textureConfig.gridSpacing')
                }}</label>
                <el-slider
                  v-model="config.texture.size"
                  :min="5"
                  :max="100"
                  :step="5"
                  show-input
                  show-input-controls
                ></el-slider>
              </div>
            </template>

            <div v-if="config.texture.type === 'dot'">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.textureConfig.dotSize')
                }}</label>
                <el-input-number
                  v-model="config.texture.dotSize"
                  :min="1"
                  :max="20"
                  :step="1"
                  controls-position="right"
                  class="w-full"
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.textureConfig.dotSpacing')
                }}</label>
                <el-input-number
                  v-model="config.texture.size"
                  :min="10"
                  :max="100"
                  :step="5"
                  controls-position="right"
                  class="w-full"
                />
              </div>
            </div>

            <div v-if="config.texture.type === 'noise'">
              <div>
                <label class="block text-sm font-medium mb-2">{{
                  I18nT('tools.ImageCompress.textureConfig.noiseIntensity')
                }}</label>
                <el-slider
                  v-model="config.texture.intensity"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :format-tooltip="(val: number) => (val * 100).toFixed(0) + '%'"
                  show-input
                  :show-input-controls="false"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 混合和变换 -->
        <div class="border rounded-lg p-4">
          <h4 class="text-md font-medium mb-3">{{
            I18nT('tools.ImageCompress.textureConfig.blendTransform')
          }}</h4>

          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.textureConfig.blendMode')
              }}</label>
              <el-select v-model="config.texture.blendMode" class="w-full">
                <el-option :label="I18nT('tools.ImageCompress.textureConfig.none')" value="over" />
                <el-option
                  :label="I18nT('tools.ImageCompress.textureConfig.overlay')"
                  value="overlay"
                />
                <el-option
                  :label="I18nT('tools.ImageCompress.textureConfig.multiply')"
                  value="multiply"
                />
                <el-option
                  :label="I18nT('tools.ImageCompress.textureConfig.screen')"
                  value="screen"
                />
                <el-option
                  :label="I18nT('tools.ImageCompress.textureConfig.softLight')"
                  value="soft-light"
                />
                <el-option
                  :label="I18nT('tools.ImageCompress.textureConfig.hardLight')"
                  value="hard-light"
                />
              </el-select>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.textureConfig.rotationAngleDeg')
              }}</label>
              <el-slider
                v-model="config.texture.angle"
                :min="0"
                :max="359"
                :step="1"
                show-input
                show-input-controls
              ></el-slider>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{{
                I18nT('tools.ImageCompress.textureConfig.scale')
              }}</label>
              <el-slider
                v-model="config.texture.scale"
                :min="0.1"
                :max="5"
                :step="0.1"
                show-input
                show-input-controls
              ></el-slider>
            </div>
          </div>
        </div>
      </template>
    </div>

    <TexturePreview v-if="config.texture.enabled" />
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'
  import { dialog } from '@/util/NodeFn'
  import TexturePreview from './TexturePreview.vue'
  import { Picture } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'

  const config = ImageCompressSetup

  // 纹理类型变化时的处理
  function onTextureTypeChange(type: string) {
    if (!config.texture) return

    // 根据纹理类型设置合适的默认值
    switch (type) {
      case 'grid':
        config.texture.size = 20
        config.texture.lineWidth = 1
        config.texture.color = 'rgba(255,255,255,0.4)'
        break
      case 'dot':
        config.texture.size = 20
        config.texture.dotSize = 2
        config.texture.color = 'rgba(255,255,255,0.4)'
        break
      case 'line':
        config.texture.size = 30
        config.texture.lineWidth = 1
        config.texture.color = 'rgba(255,255,255,0.4)'
        break
      case 'noise':
        config.texture.intensity = 0.05
        config.texture.color = 'rgba(255,255,255,0.4)'
        break
      case 'custom':
        config.texture.customImage = ''
        break
    }
  }

  const selectTextureImage = () => {
    console.log('选择纹理图片')
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
        config.texture.customImage = path
      })
  }
</script>
