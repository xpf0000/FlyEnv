<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { codesByCategories } from './http-status-codes.constants'
  import { I18nT } from '@shared/lang'

  const search = ref('')
  const searchResult = computed(() => {
    const all = codesByCategories.flatMap(({ codes, category }) =>
      codes.map((code) => ({ ...code, category }))
    )
    const s = search.value.toLowerCase()
    return all.filter((item: any) => {
      let has = false
      for (const k in item) {
        const v = `${item[k]}`.toLowerCase()
        if (s.includes(v) || v.includes(s)) {
          has = true
          continue
        }
      }
      return has
    })
  })
  const codesByCategoryFiltered = computed(() => {
    if (!search.value.trim()) {
      return codesByCategories
    }
    return [{ category: 'Search results', codes: searchResult.value }]
  })
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('http-status-codes.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-input v-model="search" placeholder="Search http status..." autofocus class="mb-9" />

        <div v-for="{ codes, category } of codesByCategoryFiltered" :key="category" class="mb-8">
          <div class="mb-4 text-xl">
            {{ category }}
          </div>

          <el-card
            v-for="{ code, description, name, type } of codes"
            :key="code"
            :shadow="false"
            class="mb-2"
          >
            <div class="text-lg font-bold"> {{ code }} {{ name }} </div>
            <div class="op-70"> {{ description }} {{ type !== 'HTTP' ? `For ${type}.` : '' }} </div>
          </el-card>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>
