<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config">
    <h3 class="text-lg font-medium mb-4 text-gray-700">基础配置</h3>

    <div class="space-y-6">
      <!-- 文件路径 -->
      <div>
        <label class="block text-sm font-medium mb-2">输出路径</label>
        <el-input v-model="config.path" placeholder="请输入保存路径" clearable>
          <template #append>
            <el-button icon="Folder" @click="selectPath" />
          </template>
        </el-input>
      </div>

      <!-- 尺寸配置 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-2">宽度 (像素)</label>
          <el-input-number
            v-model="config.width"
            :min="1"
            :max="9999"
            :step="1"
            placeholder="自动"
            controls-position="right"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">高度 (像素)</label>
          <el-input-number
            v-model="config.height"
            :min="1"
            :max="9999"
            :step="1"
            placeholder="自动"
            controls-position="right"
            class="w-full"
          />
        </div>
      </div>

      <!-- 缩放模式和格式 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-2">缩放模式</label>
          <el-select v-model="config.fit" class="w-full">
            <el-option label="contain" value="contain" />
            <el-option label="cover" value="cover" />
            <el-option label="fill" value="fill" />
            <el-option label="inside" value="inside" />
            <el-option label="outside" value="outside" />
          </el-select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">输出格式</label>
          <el-select v-model="config.format" class="w-full">
            <el-option label="JPEG" value="jpeg" />
            <el-option label="PNG" value="png" />
            <el-option label="WebP" value="webp" />
            <el-option label="AVIF" value="avif" />
            <el-option label="GIF" value="gif" />
            <el-option label="TIFF" value="tiff" />
            <el-option label="HEIF" value="heif" />
          </el-select>
        </div>
      </div>

      <!-- 高级选项 -->
      <div class="border-t pt-4">
        <h4 class="text-md font-medium mb-3 text-gray-600">高级选项</h4>
        <div class="space-y-4">
          <el-checkbox v-model="config.withoutEnlargement">禁止放大</el-checkbox>
          <el-checkbox v-model="config.fastShrinkOnLoad">快速缩小加载</el-checkbox>
          <el-checkbox v-model="config.withMetadata">保留元数据</el-checkbox>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ImageCompressSetup from './setup'

  const config = ImageCompressSetup

  const selectPath = () => {
    // 这里可以调用文件选择对话框
    console.log('选择文件路径')
  }
</script>
