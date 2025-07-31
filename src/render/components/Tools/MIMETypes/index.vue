<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { asyncComputed } from '@vueuse/core'
  import { I18nT } from '@lang/index'
  import { mime } from '@/util/NodeFn'

  const miniTypes = asyncComputed(async() => {
    const { types, extensions } = await mime.types()
    console.log('miniTypes: ', types, extensions )
    return { types, extensions }
  })

  const extensions = computed(() => {
    return miniTypes?.value?.extensions ?? {}
  })

  const types = computed(() => {
    return miniTypes?.value?.types ?? {}
  })

  const mimeInfos = computed(() => Object.entries(extensions.value).map(([mimeType, extensions]) => ({
    mimeType,
    extensions
  })))

  const mimeToExtensionsOptions = computed(() => Object.keys(extensions.value).map((label) => ({
    label,
    value: label
  })))
  const selectedMimeType = ref(undefined)

  const extensionsFound = computed(() =>
    selectedMimeType.value ? extensions?.value?.[selectedMimeType.value] ?? '' : []
  )

  const typesOptions = computed(() => Object.keys(types.value).map((label) => {
    const extension = `.${label}`

    return { label: extension, value: label }
  }))

  const selectedExtension = ref(undefined)

  const mimeTypeFound = computed(() =>
    selectedExtension.value ? types.value?.[selectedExtension.value] ?? '' : []
  )
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.mime-types-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-card>
          <h2 class="text-2xl font-bold"> MIME Type to Extension </h2>
          <div class="opacity-80 mt-1">
            Know which file extensions are associated to a MIME type
          </div>
          <el-select
            v-model="selectedMimeType"
            class="my-4 w-full"
            filterable
            placeholder="Select your MIME type here... (ex: application/pdf)"
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
            MIME type:
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
          <h2 class="text-2xl font-bold"> File extension to MIME type </h2>
          <div class="opacity-80 mt-1">
            Know which MIME type is associated with a file extension
          </div>
          <el-select
            v-model="selectedExtension"
            class="my-4 w-full"
            filterable
            placeholder="Select your mimetype here... (ex: application/pdf)"
          >
            <template v-for="item in typesOptions" :key="item.value">
              <el-option :label="item.label" :value="item.value"></el-option>
            </template>
          </el-select>

          <div v-if="selectedExtension">
            MIME type associated to the extension
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
          <el-table-column label="MIME Types" prop="mimeType"></el-table-column>
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
