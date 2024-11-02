<script setup lang="ts">
  import { types as extensionToMimeType, extensions as mimeTypeToExtension } from 'mime-types'
  import { computed, ref } from 'vue'
  import { I18nT } from '@shared/lang'

  const mimeInfos = Object.entries(mimeTypeToExtension).map(([mimeType, extensions]) => ({
    mimeType,
    extensions
  }))

  const mimeToExtensionsOptions = Object.keys(mimeTypeToExtension).map((label) => ({
    label,
    value: label
  }))
  const selectedMimeType = ref(undefined)

  const extensionsFound = computed(() =>
    selectedMimeType.value ? mimeTypeToExtension[selectedMimeType.value] : []
  )

  const extensionToMimeTypeOptions = Object.keys(extensionToMimeType).map((label) => {
    const extension = `.${label}`

    return { label: extension, value: label }
  })
  const selectedExtension = ref(undefined)

  const mimeTypeFound = computed(() =>
    selectedExtension.value ? extensionToMimeType[selectedExtension.value] : []
  )
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('mime-types.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-card>
          <h2 class="text-2xl font-bold"> Mime type to extension </h2>
          <div class="opacity-80 mt-1">
            Know which file extensions are associated to a mime-type
          </div>
          <el-select
            v-model="selectedMimeType"
            class="my-4 w-full"
            filterable
            placeholder="Select your mimetype here... (ex: application/pdf)"
          >
            <template v-for="item in mimeToExtensionsOptions" :key="item.value">
              <el-option :label="item.label" :value="item.value"></el-option>
            </template>
          </el-select>

          <div v-if="extensionsFound.length > 0">
            Extensions of files with the
            <el-tag round type="info" effect="dark" class="select-text">
              {{ selectedMimeType }}
            </el-tag>
            mime-type:
            <div style="margin-top: 10px">
              <el-tag
                v-for="extension of extensionsFound"
                :key="extension"
                class="select-text"
                round
                effect="dark"
                type="primary"
                style="margin-right: 10px"
              >
                .{{ extension }}
              </el-tag>
            </div>
          </div>
        </el-card>
        <el-card class="my-4">
          <h2 class="text-2xl font-bold"> File extension to mime type </h2>
          <div class="opacity-80 mt-1">
            Know which mime type is associated to a file extension
          </div>
          <el-select
            v-model="selectedExtension"
            class="my-4 w-full"
            filterable
            placeholder="Select your mimetype here... (ex: application/pdf)"
          >
            <template v-for="item in extensionToMimeTypeOptions" :key="item.value">
              <el-option :label="item.label" :value="item.value"></el-option>
            </template>
          </el-select>

          <div v-if="selectedExtension">
            Mime type associated to the extension
            <el-tag round type="info" effect="dark" class="select-text">
              {{ selectedExtension }}
            </el-tag>
            file extension:
            <div style="margin-top: 10px">
              <el-tag
                round
                type="primary"
                style="margin-right: 10px"
                effect="dark"
                class="select-text"
              >
                {{ mimeTypeFound }}
              </el-tag>
            </div>
          </div>
        </el-card>
        <el-table :data="mimeInfos" class="select-text">
          <el-table-column label="Mime types" prop="mimeType"></el-table-column>
          <el-table-column label="Extensions" prop="extensions">
            <template #default="scope">
              <el-tag
                v-for="extension of scope.row.extensions"
                :key="extension"
                round
                effect="dark"
                type="info"
                style="margin-right: 10px"
              >
                .{{ extension }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-scrollbar>
    </div>
  </div>
</template>
