<!-- CompressConfig.vue 压缩配置 -->
<template>
  <div class="border rounded-lg p-4 mt-4">
    <h4 class="text-md font-medium mb-3 flex items-center gap-2">
      <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      {{ I18nT('tools.ImageCompress.preview.effectPreview') }}
    </h4>

    <!-- 文件选择区域 -->
    <div class="flex items-center gap-3 mb-4">
      <el-input
        v-model="dir"
        :placeholder="I18nT('tools.ImageCompress.preview.selectImageFile')"
        readonly
        class="flex-1"
      >
        <template #append>
          <el-button :icon="FolderOpened" class="hover:bg-gray-100" @click.stop="chooseFile">
          </el-button>
        </template>
      </el-input>
      <el-button
        :disabled="!dir || running"
        type="primary"
        :icon="VideoPlay"
        :loading="running"
        @click.stop="doTest"
      >
      </el-button>
      <el-button
        :disabled="!testResult?.compressed?.base64"
        type="primary"
        :icon="Download"
        @click.stop="ImageCompressSetup.download(testResult?.compressed?.base64 ?? '')"
      >
      </el-button>
    </div>

    <!-- 压缩结果展示区域 -->
    <div v-if="testResult?.original" class="w-full">
      <!-- 图片信息对比 -->
      <div class="w-full mb-4">
        <div class="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <!-- 原图信息卡片 -->
          <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div class="flex items-center justify-between mb-2">
              <h5 class="text-sm font-medium flex items-center gap-1">
                <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>{{ I18nT('tools.ImageCompress.preview.original') }}</span>
              </h5>
              <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                {{ testResult.original.format?.toUpperCase() }}
              </span>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between">
                <span>{{ I18nT('tools.ImageCompress.preview.dimensions') }}</span>
                <span class="font-medium text-gray-800">
                  {{ testResult.original.dimensions.width }} ×
                  {{ testResult.original.dimensions.height }}
                </span>
              </div>
              <div class="flex justify-between">
                <span>{{ I18nT('tools.ImageCompress.preview.fileSize') }}</span>
                <span class="font-medium text-gray-800">
                  {{ testResult.original.size.kilobytes }} KB
                </span>
              </div>
            </div>
          </div>

          <!-- 压缩后信息卡片 -->
          <div
            class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200"
          >
            <div class="flex items-center justify-between mb-2">
              <h5 class="text-sm font-medium flex items-center gap-1">
                <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span>{{ I18nT('tools.ImageCompress.preview.compressedImage') }}</span>
              </h5>
              <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                {{ testResult.compressed.format?.toUpperCase() }}
              </span>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between">
                <span>{{ I18nT('tools.ImageCompress.preview.dimensions') }}</span>
                <span class="font-medium text-gray-800">
                  {{ testResult.compressed.dimensions.width }} ×
                  {{ testResult.compressed.dimensions.height }}
                </span>
              </div>
              <div class="flex justify-between">
                <span>{{ I18nT('tools.ImageCompress.preview.fileSize') }}</span>
                <span class="font-medium text-gray-800">
                  {{ testResult.compressed.size.kilobytes.toFixed(2) }} KB
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 压缩统计信息 -->
        <div
          class="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100"
        >
          <div class="flex items-center justify-between mb-3">
            <h6 class="text-sm font-medium flex items-center gap-2">
              <svg
                class="w-4 h-4 text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span>{{ I18nT('tools.ImageCompress.preview.compressionResult') }}</span>
            </h6>
            <span
              class="text-xs font-semibold px-2 py-1 rounded-full"
              :class="
                testResult.compression.isReduced
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              "
            >
              {{
                testResult.compression.isReduced
                  ? `✓ ${I18nT('tools.ImageCompress.preview.effectiveCompression')}`
                  : `⚠ ${I18nT('tools.ImageCompress.preview.largerAfterCompression')}`
              }}
            </span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">
                <span>{{ I18nT('tools.ImageCompress.preview.compressionRatio') }}</span>
              </div>
              <div
                class="text-lg font-bold"
                :class="testResult.compression.ratio > 0 ? 'text-green-600' : 'text-red-600'"
              >
                {{ testResult.compression.ratio > 0 ? '−' : '+'
                }}{{ Math.abs(testResult.compression.ratio) }}%
              </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">
                <span>{{ I18nT('tools.ImageCompress.preview.sizeReduction') }}</span>
              </div>
              <div class="text-lg font-bold text-blue-600">
                {{ testResult.compression.sizeReduced.kilobytes }} KB
              </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">
                <span>{{ I18nT('tools.ImageCompress.preview.originalSize') }}</span>
              </div>
              <div class="text-sm font-medium"> {{ testResult.original.size.kilobytes }} KB </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">
                <span>{{ I18nT('tools.ImageCompress.preview.compressedSize') }}</span>
              </div>
              <div class="text-sm font-medium"> {{ testResult.compressed.size.kilobytes }} KB </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片对比区域 -->
      <div
        class="w-full grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
      >
        <div class="flex flex-col items-center p-3 gap-3">
          <el-image
            :src="testResult.original.base64"
            :preview-src-list="[testResult.original.base64]"
            class="w-full"
          >
            <template #error>
              <div class="w-full h-full flex items-center justify-center bg-gray-200">
                <svg
                  class="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </template>
          </el-image>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 bg-green-500 rounded-full"></span>
            <span>{{ I18nT('tools.ImageCompress.preview.original') }}</span>
          </div>
        </div>

        <div class="flex flex-col items-center p-3 gap-3">
          <el-image
            :src="testResult.compressed.base64"
            :preview-src-list="[testResult.compressed.base64]"
            class="w-full"
          >
            <template #error>
              <div class="w-full h-full flex items-center justify-center bg-gray-200">
                <svg
                  class="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </template>
          </el-image>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 bg-blue-500 rounded-full"></span>
            <span>{{ I18nT('tools.ImageCompress.preview.effect') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty
      v-else
      :description="I18nT('tools.ImageCompress.preview.selectFileForCompression')"
      :image-size="80"
    >
    </el-empty>
  </div>
</template>

<script setup lang="ts">
  import { reactive, ref, onUnmounted } from 'vue'
  import { Download, FolderOpened, VideoPlay } from '@element-plus/icons-vue'
  import { CompressTestResult } from '../../../../fork/module/Image/imageCompress.type'
  import { dialog } from '@/util/NodeFn'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import ImageCompressSetup from './setup'

  const config = ImageCompressSetup

  const running = ref(false)
  const dir = ref('')
  const testResult = ref<CompressTestResult>()

  // 选择文件
  const chooseFile = () => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles'],
        filters: [
          {
            name: 'Image Files',
            extensions: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']
          }
        ]
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        dir.value = path
        // 自动触发测试
        doTest()
      })
  }

  // 执行压缩测试
  const doTest = () => {
    if (running.value || !dir.value) {
      return
    }
    running.value = true
    IPC.send('app-fork:image', 'imageBaseTest', dir.value, JSON.parse(JSON.stringify(config))).then(
      (key, res) => {
        IPC.off(key)
        running.value = false
        if (res?.code === 0) {
          testResult.value = reactive(res?.data ?? {})
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          testResult.value = undefined
        }
      }
    )
  }

  // 组件卸载时清理事件监听
  onUnmounted(() => {})
</script>

<style scoped></style>
