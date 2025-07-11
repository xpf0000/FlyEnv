<script setup lang="ts">
  import { watch, ref, Ref } from 'vue'
  import { useBase64 } from '@vueuse/core'
  import { I18nT } from '@lang/index'
  import { isValidBase64 } from '@/util/Base64'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { fileSelect } from '@/util/Index'
  import { dialog, shell, clipboard, fs } from '@/util/NodeFn'

  const textError = ref(false)
  const base64Text = ref('')
  const imgShow = ref(false)

  watch(base64Text, (v) => {
    textError.value = !isValidBase64(v)
    imgShow.value = false
  })

  const saveFile = () => {
    dialog
      .showSaveDialog({
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        const base64 = base64Text.value.replace(/^data:(.*?)\/\w+;base64,/, '')
        fs.writeBufferBase64(filePath, base64, function (err: Error | null) {
          if (err) {
            MessageError(err.message)
            return
          }
          shell.showItemInFolder(filePath)
        })
      })
  }

  const file: Ref<File> = ref() as any
  const fileBase64 = ref('')

  const choosePath = () => {
    fileSelect().then((files: FileList) => {
      console.log('choosePath files: ', files)
      if (!files.length) {
        return
      }
      file.value = files[0]
      useBase64(file.value)
        .execute()
        .then((res) => {
          fileBase64.value = res
        })
    })
  }

  const copyFileBase64 = () => {
    clipboard.writeText(fileBase64.value)
    MessageSuccess(I18nT('base.success'))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e?.dataTransfer?.files ?? []
    if (!files.length) {
      return
    }
    file.value = files[0]
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
        <span class="text-xl">{{ I18nT('tools.base64-file-converter-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card header="Base64 to file">
              <el-form-item
                label-position="top"
                :error="textError ? 'Invalid base 64 string' : null"
              >
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
    </el-scrollbar>
  </div>
</template>
