<template>
  <template v-if="allTypes.length > 0">
    <el-collapse v-model="activeNames">
      <template v-for="type in allTypes" :key="type">
        <el-collapse-item :title="type" :name="type">
          <div
            class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <template v-for="item in setting.filter((s) => s.type === type)" :key="item.name">
              <CommonItem :item="item" :index="index" />
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
      <template v-for="item in setting" :key="item.name">
        <CommonItem :item="item" :index="index" />
      </template>
    </div>
  </template>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import type { CommonSetItem } from '@web/components/Conf/setup'
  import CommonItem from './commonItem.vue'

  const props = defineProps<{
    setting: CommonSetItem[]
  }>()

  const index = ref(0)

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

  watch(
    () => props.setting,
    () => {
      console.log('props.setting changed !!!')
      index.value += 1
    }
  )
</script>
