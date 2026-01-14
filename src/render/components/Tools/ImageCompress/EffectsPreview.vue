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
      效果预览
    </h4>

    <!-- 文件选择区域 -->
    <div class="flex items-center gap-3 mb-4">
      <el-input v-model="dir" placeholder="选择图片文件" readonly class="flex-1">
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
        :disabled="!testResult?.effected?.base64"
        type="primary"
        :icon="Download"
        @click.stop="ImageCompressSetup.download(testResult?.effected?.base64 ?? '')"
      >
      </el-button>
    </div>

    <!-- 压缩结果展示区域 -->
    <div v-if="testResult?.original" class="w-full">
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
            <span>原图</span>
          </div>
        </div>

        <div class="flex flex-col items-center p-3 gap-3">
          <el-image
            :src="testResult.effected.base64"
            :preview-src-list="[testResult.effected.base64]"
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
            <span>效果</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="请选择图片文件进行效果预览" :image-size="80"> </el-empty>
  </div>
</template>

<script setup lang="ts">
  import { reactive, ref, onUnmounted } from 'vue'
  import { Download, FolderOpened, VideoPlay } from '@element-plus/icons-vue'
  import type { EffectsTestResult } from '../../../../fork/module/Image/imageCompress.type'
  import { dialog } from '@/util/NodeFn'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import ImageCompressSetup from './setup'

  const config = ImageCompressSetup

  const running = ref(false)
  const dir = ref('')
  const testResult = ref<EffectsTestResult>()

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
      'imageEffectsTest',
      dir.value,
      JSON.parse(JSON.stringify(config))
    ).then((key, res) => {
      IPC.off(key)
      running.value = false
      if (res?.code === 0) {
        testResult.value = reactive(res?.data ?? {})
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
        testResult.value = undefined
      }
    })
  }

  // 组件卸载时清理事件监听
  onUnmounted(() => {})
</script>

<style scoped></style>
