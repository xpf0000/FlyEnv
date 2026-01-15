<!-- ImageCompressConfig.vue 主组件 -->
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.ImageCompress.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <div class="image-compress-config h-full overflow-hidden">
        <el-tabs v-model="activeTab" type="border-card" class="config-tabs el-tabs-content-flex-1">
          <el-tab-pane :label="I18nT('tools.ImageCompress.batchProcessing.title')" name="batch">
            <BatchImage />
          </el-tab-pane>
          <el-tab-pane :label="I18nT('tools.ImageCompress.basicConfig.title')" name="basic">
            <el-scrollbar>
              <BasicConfig />
            </el-scrollbar>
          </el-tab-pane>
          <el-tab-pane :label="I18nT('tools.ImageCompress.compressConfig.title')" name="compress">
            <el-scrollbar>
              <CompressConfig />
            </el-scrollbar>
          </el-tab-pane>
          <el-tab-pane :label="I18nT('tools.ImageCompress.effectsConfig.title')" name="effects">
            <el-scrollbar>
              <EffectsConfig />
            </el-scrollbar>
          </el-tab-pane>
          <el-tab-pane :label="I18nT('tools.ImageCompress.watermarkConfig.title')" name="watermark">
            <el-scrollbar>
              <WatermarkConfig />
            </el-scrollbar>
          </el-tab-pane>
          <el-tab-pane :label="I18nT('tools.ImageCompress.textureConfig.title')" name="texture">
            <el-scrollbar>
              <TextureConfig />
            </el-scrollbar>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch, computed } from 'vue'
  import BasicConfig from './BasicConfig.vue'
  import CompressConfig from './CompressConfig.vue'
  import EffectsConfig from './EffectsConfig.vue'
  import WatermarkConfig from './WatermarkConfig.vue'
  import TextureConfig from './TextureConfig.vue'
  import BatchImage from '@/components/Tools/ImageCompress/BatchImage.vue'
  import { I18nT } from '@lang/index'
  import { ImageBatch } from '@/components/Tools/ImageCompress/setup'
  import ConfigSetup from '@/components/Tools/ImageCompress/setup'

  const activeTab = ref('batch')

  const config = computed(() => ConfigSetup)

  ImageBatch.init().then(() => {
    watch(
      config,
      () => {
        ImageBatch.save()
      },
      {
        deep: true
      }
    )
  })
</script>

<style scoped>
  .config-tabs {
    @apply shadow-md;
  }

  :deep(.el-tabs__content) {
    @apply p-6;
  }
</style>
