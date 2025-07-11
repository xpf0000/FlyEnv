<script setup lang="ts">
  import { watch, computed, ComputedRef } from 'vue'
  import Store from './store'
  import { I18nT } from '@lang/index'
  import { CopyDocument } from '@element-plus/icons-vue'

  const dict: ComputedRef<Record<string, string>> = computed(() => {
    return Store.urlDict
  })

  const urlObject: ComputedRef<URL> = computed(() => {
    return Store.urlDict
  })

  watch(
    () => Store.url,
    () => {
      Store.parse()
    },
    {
      immediate: true
    }
  )
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.url-parse-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <el-card>
          <el-form-item label-position="top" label="URL:">
            <el-input v-model="Store.url" placeholder="Your URL to parse..."></el-input>
          </el-form-item>
          <template v-for="item in Store.list" :key="item.key">
            <el-form-item :label="item.title" label-position="left" label-width="100px">
              <el-input :model-value="dict?.[item.key]" readonly placeholder=" ">
                <template #suffix>
                  <el-button
                    link
                    :icon="CopyDocument"
                    @click.stop="Store.copy(dict?.[item.key])"
                  ></el-button>
                </template>
              </el-input>
            </el-form-item>
          </template>
          <template
            v-for="[k, v] in Object.entries(
              Object.fromEntries(urlObject?.searchParams.entries() ?? [])
            )"
            :key="k"
          >
            <el-form-item label-position="left" label-width="100px">
              <template #label>
                <svg data-v-2ecbdcbb="" viewBox="0 0 24 24" width="1.2em" height="1.2em">
                  <path
                    fill="currentColor"
                    d="m20 16l-5.5 5.5l-1.42-1.41L16.17 17H10.5A6.5 6.5 0 0 1 4 10.5V4h2v6.5C6 13 8 15 10.5 15h5.67l-3.08-3.09l1.41-1.41L20 16Z"
                  ></path>
                </svg>
              </template>
              <div class="flex gap-1 w-full">
                <el-input class="flex-1" :model-value="k" readonly placeholder=" ">
                  <template #suffix>
                    <el-button link :icon="CopyDocument" @click.stop="Store.copy(k)"></el-button>
                  </template>
                </el-input>
                <el-input class="flex-1" :model-value="v" readonly placeholder=" ">
                  <template #suffix>
                    <el-button link :icon="CopyDocument" @click.stop="Store.copy(v)"></el-button>
                  </template>
                </el-input>
              </div>
            </el-form-item>
          </template>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>
