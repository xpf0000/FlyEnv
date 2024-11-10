<script setup lang="ts">
  import { watch, ref, Ref } from 'vue'
  import { useBase64 } from '@vueuse/core'
  import { I18nT } from '@shared/lang'
  import { isValidBase64 } from '@shared/base64'
  import { MessageSuccess } from '@/util/Element'

  const textError = ref(false)
  const base64Text = ref('')
  const imgShow = ref(false)

  watch(base64Text, (v) => {
    textError.value = !isValidBase64(v)
    imgShow.value = false
  })

  const saveFile = () => {}

  const file: Ref<File> = ref() as any
  const fileBase64 = ref('')

  const choosePath = () => {}

  const copyFileBase64 = () => {
    MessageSuccess(I18nT('base.success'))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    let files = e?.dataTransfer?.files ?? []
    files.length > 0 && (file.value = files[0])
    useBase64(file.value)
      .execute()
      .then((res) => {
        fileBase64.value = res
      })
  }
  const onDragover = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('base64-file-converter.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper pb-0">
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div>
          <el-card header="Base64 to file">
            <el-form-item label-position="top" :error="textError ? 'Invalid base 64 string' : null">
              <el-input
                v-model="base64Text"
                type="textarea"
                :rows="5"
                placeholder="Put your base64 file string here..."
              ></el-input>
            </el-form-item>
            <div v-if="imgShow" class="flex justify-center mb-4">
              <el-image :src="base64Text">
                <template #error>
                  <span>Invalid base 64 string image</span>
                </template>
              </el-image>
            </div>
            <div class="flex justify-center gap-3">
              <el-button @click.stop="imgShow = true">Preview image</el-button>
              <el-button @click.stop="saveFile">Save file</el-button>
            </div>
          </el-card>
        </div>
        <div>
          <el-card header="File to base64">
            <div
              id="selectDir"
              class="flex flex-col justify-center items-center gap-3 py-8 rounded-md border-dashed border-2 cursor-pointer mb-4"
              @drop.stop="onDrop"
              @dragover.stop="onDragover"
              @click.stop="choosePath"
            >
              <yb-icon :svg="import('@/svg/upload.svg?raw')" class="icon w-12 h-12" />
              <span>{{ I18nT('base.fileInfoTips') }}</span>
            </div>
            <el-input
              readonly
              :model-value="fileBase64"
              type="textarea"
              :rows="5"
              placeholder="File in base64 will be here"
            ></el-input>
            <div class="flex justify-center mt-4">
              <el-button @click.stop="copyFileBase64()">Copy</el-button>
            </div>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>
