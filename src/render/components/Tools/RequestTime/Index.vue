<template>
  <div class="tools-system-env tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.URLTimingAnalyzer') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper flex-1 overflow-hidden">
      <el-input
        v-model="Setup.url"
        placeholder="URL"
        class="input-with-select flex-shrink-0"
        @keyup.enter="Setup.doFetch()"
      >
        <template #append>
          <template v-if="Setup.fetching">
            <el-button :loading="true" />
          </template>
          <template v-else>
            <el-button :icon="Search" :disabled="disabled" @click="Setup.doFetch()" />
          </template>
        </template>
      </el-input>
      <div class="table-wapper w-full flex-1 overflow-hidden">
        <el-card
          :header="null"
          shadow="never"
          class="h-full overflow-hidden flex flex-col"
          header-class="flex-shrink-0"
          body-class="flex-1 overflow-hidden"
        >
          <el-table height="100%" :data="Setup.list" size="default" style="width: 100%">
            <el-table-column prop="Metric" :label="I18nT('requestTimer.metric')"> </el-table-column>
            <el-table-column prop="Value" :label="I18nT('requestTimer.value')"> </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { Search } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { Setup } from './setup'
  import { computed } from 'vue'

  const disabled = computed(() => {
    if (!Setup.url.trim()) {
      return true
    }
    const url = Setup.url.trim()
    let is = false
    try {
      const u = new URL(url)
      console.log(u)
    } catch (e) {
      is = true
    }
    return is
  })
</script>
