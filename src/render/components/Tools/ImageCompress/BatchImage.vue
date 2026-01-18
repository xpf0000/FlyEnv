<!-- BasicConfig.vue 基础配置 -->
<template>
  <div class="basic-config h-full overflow-hidden flex flex-col">
    <h3 class="text-lg font-medium mb-4 flex-shrink-0">{{
      I18nT('tools.ImageCompress.batchProcessing.title')
    }}</h3>

    <el-form label-position="top" class="mb-4 flex-shrink-0" @submit.prevent>
      <el-form-item :label="I18nT('tools.ImageCompress.batchProcessing.overwriteSource')">
        <el-switch v-model="ImageBatch.rewrite"></el-switch>
      </el-form-item>
      <el-form-item
        v-if="!ImageBatch.rewrite"
        :label="I18nT('tools.ImageCompress.batchProcessing.saveLocation')"
      >
        <el-input :model-value="ImageBatch.saveDir" readonly>
          <template #append>
            <el-button
              :icon="FolderOpened"
              @click.stop="ImageBatch.selectSaveDir('save')"
            ></el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item v-else :label="I18nT('tools.ImageCompress.batchProcessing.backupLocation')">
        <el-input :model-value="ImageBatch.backupDir" readonly>
          <template #append>
            <el-button
              :icon="FolderOpened"
              @click.stop="ImageBatch.selectSaveDir('backup')"
            ></el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

    <el-card ref="card" class="app-base-el-card flex-1 w-full">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span>{{ I18nT('tools.ImageCompress.batchProcessing.imageFiles') }}</span>
            <template v-if="isLocked">
              <el-tooltip placement="top" :content="I18nT('fork.trialEnd')">
                <Lock class="w-[18px] h-[18px] text-yellow-500 select-none outline-none"></Lock>
              </el-tooltip>
            </template>
            <template v-else>
              <template v-if="ImageBatch.processing">
                <el-button :loading="true" link></el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  type="success"
                  :disabled="!ImageBatch.images.length"
                  @click.stop="ImageBatch.doProcess()"
                >
                  <yb-icon class="w-[18px] h-[18px]" :svg="import('@/svg/play.svg?raw')" />
                </el-button>
              </template>
            </template>
          </div>
          <div class="flex items-center">
            <template v-if="isMacOS">
              <el-button
                :icon="Plus"
                type="primary"
                link
                @click.stop="ImageBatch.selectDir()"
              ></el-button>
            </template>
            <template v-else>
              <el-button
                :icon="Picture"
                type="primary"
                link
                @click.stop="ImageBatch.selectDir('file')"
              ></el-button>
              <el-button
                :icon="Folder"
                type="primary"
                link
                @click.stop="ImageBatch.selectDir('folder')"
              ></el-button>
            </template>
            <el-button
              :disabled="!choosed.length"
              :icon="Delete"
              type="danger"
              link
              @click.stop="doDelete"
            ></el-button>
          </div>
        </div>
      </template>
      <li v-show="onDrag" class="w-full h-full z-50 flex items-center justify-center">
        <div
          class="w-[70%] h-[70%] border-2 border-dashed border-yellow-500 text-yellow-500 rounded-[10px] flex flex-col items-center justify-center gap-[20px]"
        >
          <yb-icon :svg="import('@/svg/upload.svg?raw')" class="w-[100px] h-[100px]" />
          <span>{{ $t('base.fileInfoTips') }}</span>
        </div>
      </li>
      <el-table
        v-show="!onDrag"
        row-key="path"
        class="h-full w-full"
        :data="ImageBatch.images"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column type="index"></el-table-column>
        <el-table-column
          :label="I18nT('tools.ImageCompress.batchProcessing.path')"
          width="auto"
          prop="path"
        >
          <template #default="scope">
            <BatchImageTablePathCell :content="scope.row.path" />
          </template>
        </el-table-column>
        <el-table-column
          :label="I18nT('tools.ImageCompress.batchProcessing.beforeProcessing')"
          width="160px"
        >
          <template #default="scope">
            <div v-if="scope.row.status === 'fetching'" class="flex items-center">
              <el-button link loading></el-button>
            </div>
            <div v-else-if="!scope.row?.hasError" class="flex flex-col items-start gap-1">
              <el-tag type="primary">{{ scope.row.ext }}</el-tag>
              <el-tag type="success">{{ scope.row.width }}x{{ scope.row.height }}</el-tag>
              <el-tag type="warning">{{ scope.row.sizeFormatted }}</el-tag>
            </div>
            <div v-else>
              <span class="truncate">{{ scope.row.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          :label="I18nT('tools.ImageCompress.batchProcessing.afterProcessing')"
          width="160px"
        >
          <template #default="scope">
            <div v-if="scope.row?.result" class="flex flex-col items-start gap-1">
              <el-tag type="primary">{{ scope.row?.result.ext }}</el-tag>
              <el-tag type="success"
                >{{ scope.row?.result.width }}x{{ scope.row?.result.height }}</el-tag
              >
              <el-tag type="warning">{{ scope.row?.result.sizeFormatted }}</el-tag>
            </div>
            <div v-else-if="scope.row.status === 'processing'" class="flex items-center">
              <el-button link loading></el-button>
            </div>
            <div v-else-if="scope.row.status === 'processed' && scope.row?.result?.hasError">
              <span class="truncate">{{ scope.row?.result?.errorMessage }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { ImageBatch } from './setup'
  import { Delete, FolderOpened, Lock, Plus, Picture, Folder } from '@element-plus/icons-vue'
  import BatchImageTablePathCell from '@/components/Tools/ImageCompress/BatchImageTablePathCell.vue'
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@lang/index'
  import { initFileDroper } from '@/util/File'

  const setupStore = SetupStore()
  const choosed = ref([])
  const card = ref()
  const onDrag = ref(false)

  onMounted(() => {
    const dom = card.value.$el as HTMLElement
    initFileDroper(dom, (res) => {
      console.log('initFileDroper: ', res)
      onDrag.value = res?.ondrag
      const files = res.files
      if (files.length > 0) {
        ImageBatch.imageSelected(files)
      }
    })
  })

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })

  const isLocked = computed(() => {
    if (setupStore.isActive) {
      return false
    }
    if (ImageBatch.trialStartTime === 0) {
      return false
    }

    const currentTime = Math.round(new Date().getTime() / 1000)
    if (ImageBatch.trialStartTime + 3 * 24 * 60 * 60 < currentTime) {
      return true
    }

    return false
  })

  const handleSelectionChange = (val: any) => {
    console.log('handleSelectionChange: ', val)
    choosed.value = val
  }

  const doDelete = () => {
    if (!choosed.value.length) {
      return
    }
    ImageBatch.images = ImageBatch.images.filter((image) => {
      return !choosed.value.find((f: any) => f.path === image.path)
    })
  }
</script>
