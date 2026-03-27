<template>
  <el-scrollbar>
    <div class="setup-common">
      <div class="row-2">
        <div class="col">
          <AppFont />
        </div>
        <div class="col">
          <CodeFont />
        </div>
      </div>
    </div>
    <EditorConfig></EditorConfig>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import CodeFont from '@/components/Setup/CodeFont/index.vue'
  import AppFont from '@/components/Setup/AppFont/index.vue'
  import EditorConfig from '../EditorConfig/index.vue'
  import Font from '@/util/Font'
  Font.init().catch()
</script>
