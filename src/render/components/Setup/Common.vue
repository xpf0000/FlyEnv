<template>
  <el-scrollbar>
    <div class="setup-common">
      <div class="row-2">
        <div class="col">
          <lang-set />
        </div>
        <div class="col">
          <theme-set />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <ForceStart />
        </div>
        <div class="col">
          <AI />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <Tool />
        </div>
        <div class="col">
          <AutoLanch />
        </div>
      </div>
      <div class="row-2">
        <div class="col">
          <AutoStartService />
        </div>
        <div class="col">
          <AutoHide />
        </div>
      </div>
      <ProxySet />
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import ProxySet from './ProxySet/index.vue'
  import LangSet from './LangSet/index.vue'
  import ForceStart from './ForceStart/index.vue'
  import ThemeSet from './Theme/index.vue'
  import Tool from './Tool/index.vue'
  import AI from './AI/index.vue'
  import AutoLanch from './AutoLanch/index.vue'
  import AutoHide from './AutoHide/index.vue'
  import AutoStartService from './AutoStartService/index.vue'
</script>
