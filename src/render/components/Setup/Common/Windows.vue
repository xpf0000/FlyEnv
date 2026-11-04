<template>
  <div class="row-2">
    <div class="col">
      <ForceStart />
    </div>
    <div class="col">
      <ShowAI />
    </div>
  </div>
  <div class="row-2">
    <div class="col">
      <Tool />
    </div>
    <div class="col">
      <AutoUpdate />
    </div>
  </div>
  <div class="row-2">
    <div class="col">
      <AutoLanch />
    </div>
    <div class="col">
      <AutoStartService />
    </div>
  </div>
  <div class="row-2">
    <div class="col">
      <AutoHide />
    </div>
    <div class="col">
      <TrayStyle />
    </div>
  </div>
  <div class="row-2">
    <div class="col">
      <WindowsElevationMethod />
    </div>
    <div class="col"></div>
  </div>
</template>

<script lang="ts" setup>
  import ForceStart from '../ForceStart/index.vue'
  import ShowAI from '../AI/index.vue'
  import Tool from '../Tool/index.vue'
  import AutoUpdate from '../AutoUpdate/index.vue'
  import AutoLanch from '../AutoLanch/index.vue'
  import AutoStartService from '../AutoStartService/index.vue'
  import AutoHide from '../AutoHide/index.vue'
  import TrayStyle from '../TrayStyle/index.vue'
  import WindowsElevationMethod from '../WindowsElevationMethod/index.vue'
</script>
