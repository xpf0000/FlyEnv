<template>
  <template v-if="allTypes.length > 0">
    <el-collapse v-model="activeNames">
      <template v-for="type in allTypes" :key="type">
        <el-collapse-item :title="type" :name="type">
          <div
            class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <template v-for="(item, index) in setting.filter((s) => s.type === type)" :key="index">
              <CommonItem :item="item" />
            </template>
          </div>
        </el-collapse-item>
      </template>
    </el-collapse>
  </template>
  <template v-else>
    <div
      class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <template v-for="(item, index) in setting" :key="index">
        <CommonItem :item="item" />
      </template>
    </div>
  </template>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import type { CommonSetItem } from '@/components/Conf/setup'
  import CommonItem from './commonItem.vue'

  const props = defineProps<{
    setting: CommonSetItem[]
  }>()

  const allTypes = computed(() => {
    const set: Set<string> = new Set<string>()
    props?.setting?.forEach((s) => {
      if (s.type) {
        set.add(s.type)
      }
    })
    return Array.from(set)
  })

  const activeNames = ref([...allTypes.value])

  watch(allTypes, (v) => {
    activeNames.value = [...v]
  })
</script>
