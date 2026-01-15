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
      {{ I18nT('tools.ImageCompress.preview.compressionPreview') }}
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
                {{ I18nT('tools.ImageCompress.preview.originalImage') }}
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
                {{ I18nT('tools.ImageCompress.preview.compressedImage') }}
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
              {{ I18nT('tools.ImageCompress.preview.compressionResult') }}
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
                  ? I18nT('tools.ImageCompress.preview.effectiveCompression')
                  : I18nT('tools.ImageCompress.preview.largerAfterCompression')
              }}
            </span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">{{
                I18nT('tools.ImageCompress.preview.compressionRatio')
              }}</div>
              <div
                class="text-lg font-bold"
                :class="testResult.compression.ratio > 0 ? 'text-green-600' : 'text-red-600'"
              >
                {{ testResult.compression.ratio > 0 ? '−' : '+'
                }}{{ Math.abs(testResult.compression.ratio) }}%
              </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">{{
                I18nT('tools.ImageCompress.preview.sizeReduction')
              }}</div>
              <div class="text-lg font-bold text-blue-600">
                {{ testResult.compression.sizeReduced.kilobytes }} KB
              </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">{{
                I18nT('tools.ImageCompress.preview.originalSize')
              }}</div>
              <div class="text-sm font-medium"> {{ testResult.original.size.kilobytes }} KB </div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">{{
                I18nT('tools.ImageCompress.preview.compressedSize')
              }}</div>
              <div class="text-sm font-medium"> {{ testResult.compressed.size.kilobytes }} KB </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片对比区域 -->
      <div class="w-full relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        <!-- 图片容器 -->
        <div ref="imagePreWrapper" class="relative w-full">
          <el-image
            :src="testResult.original.base64"
            class="w-full opacity-0 z-[-1] pointer-events-none"
          >
          </el-image>
          <!-- 原图（底部） -->
          <div
            class="absolute left-0 top-0 w-full h-full z-10 overflow-hidden"
            :style="{ width: sliderPosition + '%' }"
          >
            <el-image
              :src="testResult.original.base64"
              :preview-src-list="[testResult.original.base64]"
              class="absolute left-0 top-0"
              :style="{ width: `${imageWidth}px` }"
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
          </div>

          <!-- 压缩图（可拖动） -->
          <div class="absolute inset-0 z-5">
            <el-image
              :src="testResult.compressed.base64"
              :preview-src-list="[testResult.compressed.base64]"
              class="absolute left-0 top-0"
              :style="{ width: `${imageWidth}px` }"
            >
              <template #error>
                <div class="w-full h-full flex items-center justify-center bg-blue-50">
                  <svg
                    class="w-12 h-12 text-blue-400"
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
          </div>

          <!-- 滑块控制器 -->
          <div
            class="absolute top-0 w-[2px] translate-x-[-1px] h-full cursor-col-resize z-50"
            :style="{ left: sliderPosition + '%' }"
            @mousedown="startDrag"
            @touchstart="startDrag"
          >
            <div
              class="absolute left-[-50%] -translate-x-[50%] w-2 h-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"
            ></div>
            <div
              class="absolute top-[50%] translate-y-[-50%] left-[-50%] -translate-x-[50%] w-8 h-12 rounded-lg bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg border-2 border-white flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 text-white rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                />
              </svg>
            </div>
          </div>
        </div>

        <!-- 比较说明 -->
        <div class="p-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
          <div class="flex items-center justify-between text-sm">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 bg-green-500 rounded-full"></span>
              <span>{{ I18nT('tools.ImageCompress.preview.original') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span>{{ I18nT('tools.ImageCompress.preview.effect') }}</span>
            </div>
          </div>
          <div class="mt-2 text-xs text-gray-500 text-center">
            {{ I18nT('tools.ImageCompress.preview.dragSliderPrompt') }}
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
  import { reactive, ref, onUnmounted, watch } from 'vue'
  import { Download, FolderOpened, VideoPlay } from '@element-plus/icons-vue'
  import type { CompressTestResult } from '../../../../fork/module/Image/imageCompress.type'
  import { dialog } from '@/util/NodeFn'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import ImageCompressSetup from './setup'

  const imagePreWrapper = ref<HTMLElement>()
  const config = ImageCompressSetup

  const props = defineProps<{
    format: string
  }>()

  const running = ref(false)
  const dir = ref('')
  const testResult = ref<CompressTestResult>()
  const sliderPosition = ref(50) // 滑块位置，百分比
  const isDragging = ref(false)

  let resizeObserver: ResizeObserver | null | undefined = undefined

  const imageWidth = ref(0)
  const imageRect = ref<DOMRect>(DOMRect.fromRect())
  const onResize = () => {
    const rect = imagePreWrapper?.value?.getBoundingClientRect()
    if (rect) {
      imageRect.value = rect
      imageWidth.value = rect.width
    }
  }

  watch(imagePreWrapper, (v) => {
    if (v) {
      resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(v)
    } else {
      resizeObserver?.disconnect()
      resizeObserver = null
    }
  })

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
    IPC.send(
      'app-fork:image',
      'imageCompressTest',
      dir.value,
      JSON.parse(JSON.stringify(config)),
      props.format
    ).then((key, res) => {
      IPC.off(key)
      running.value = false
      if (res?.code === 0) {
        testResult.value = reactive(res?.data ?? {})
        // 重置滑块位置
        sliderPosition.value = 50
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
        testResult.value = undefined
      }
    })
  }

  const dragEvent = (e: MouseEvent) => {
    e.preventDefault()
  }

  // 滑块拖动处理
  const startDrag = (e: MouseEvent | TouchEvent) => {
    isDragging.value = true
    e?.preventDefault?.()
    e?.stopPropagation?.()
    console.log('startDrag !!!!', e)
    // 防止默认拖拽行为
    window.addEventListener('dragstart', dragEvent)
    window.addEventListener('mousemove', handleDrag)
    window.addEventListener('mouseup', stopDrag)
    window.addEventListener('touchmove', handleDrag)
    window.addEventListener('touchend', stopDrag)
    e.preventDefault()
  }

  const handleDrag = (e: MouseEvent | TouchEvent) => {
    if (!isDragging.value) return
    e?.preventDefault?.()
    e?.stopPropagation?.()

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    let percent = ((clientX - imageRect.value.left) / imageRect.value.width) * 100
    percent = Math.max(0, Math.min(100, percent)) // 限制在0-100之间
    sliderPosition.value = percent
  }

  const stopDrag = (e: MouseEvent | TouchEvent) => {
    isDragging.value = false
    e?.preventDefault?.()
    e?.stopPropagation?.()
    window.removeEventListener('dragstart', dragEvent)
    window.removeEventListener('mousemove', handleDrag)
    window.removeEventListener('mouseup', stopDrag)
    window.removeEventListener('touchmove', handleDrag)
    window.removeEventListener('touchend', stopDrag)
  }

  // 组件卸载时清理事件监听
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleDrag)
    document.removeEventListener('mouseup', stopDrag)
    document.removeEventListener('touchmove', handleDrag)
    document.removeEventListener('touchend', stopDrag)
  })
</script>

<style scoped></style>
