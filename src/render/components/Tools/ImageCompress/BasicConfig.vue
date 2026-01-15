<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config">
    <h3 class="text-lg font-medium mb-4">{{ I18nT('tools.ImageCompress.basicConfig.title') }}</h3>

    <div class="space-y-6">
      <!-- 尺寸配置 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.basicConfig.widthPixels')
          }}</label>
          <el-input-number
            v-model="config.width"
            :min="1"
            :max="9999"
            :step="1"
            :placeholder="I18nT('tools.ImageCompress.basicConfig.auto')"
            controls-position="right"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.basicConfig.heightPixels')
          }}</label>
          <el-input-number
            v-model="config.height"
            :min="1"
            :max="9999"
            :step="1"
            :placeholder="I18nT('tools.ImageCompress.basicConfig.auto')"
            controls-position="right"
            class="w-full"
          />
        </div>
      </div>

      <!-- 缩放模式和格式 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.basicConfig.outputFormat')
          }}</label>
          <el-select v-model="config.format" class="w-full">
            <el-option
              :label="I18nT('tools.ImageCompress.basicConfig.keepOriginalFormat')"
              value="none"
            />
            <el-option :label="I18nT('tools.ImageCompress.formats.jpeg')" value="jpeg" />
            <el-option :label="I18nT('tools.ImageCompress.formats.png')" value="png" />
            <el-option :label="I18nT('tools.ImageCompress.formats.webp')" value="webp" />
            <el-option :label="I18nT('tools.ImageCompress.formats.avif')" value="avif" />
            <el-option :label="I18nT('tools.ImageCompress.formats.gif')" value="gif" />
            <el-option :label="I18nT('tools.ImageCompress.formats.tiff')" value="tiff" />
            <el-option :label="I18nT('tools.ImageCompress.formats.heif')" value="heif" />
          </el-select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">{{
            I18nT('tools.ImageCompress.basicConfig.enableCompression')
          }}</label>
          <el-switch v-model="config.compressOpen"></el-switch>
        </div>
      </div>

      <!-- 高级选项 -->
      <div class="border-t pt-4">
        <h4 class="text-md font-medium mb-3">{{
          I18nT('tools.ImageCompress.basicConfig.advancedOptions')
        }}</h4>
        <div class="space-y-4">
          <el-checkbox v-model="config.withoutEnlargement">{{
            I18nT('tools.ImageCompress.basicConfig.preventEnlargement')
          }}</el-checkbox>
          <el-checkbox v-model="config.fastShrinkOnLoad">{{
            I18nT('tools.ImageCompress.basicConfig.fastShrinkLoading')
          }}</el-checkbox>
          <el-checkbox v-model="config.withMetadata">{{
            I18nT('tools.ImageCompress.basicConfig.preserveMetadata')
          }}</el-checkbox>
        </div>
      </div>
    </div>

    <BasePreview />
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'
  import BasePreview from '@/components/Tools/ImageCompress/BasePreview.vue'
  import { I18nT } from '@lang/index'

  const config = ImageCompressSetup
</script>
