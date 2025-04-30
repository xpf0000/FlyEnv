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
      <div class="plant-title">{{ I18nT('base.showItem') }}</div>
      <div class="main user-select-none">
        <el-form label-position="left" label-width="100px">
          <el-row>
            <template v-for="(item, index) in AppModules" :key="index">
              <el-col :span="8">
                <ModuleShowHide :label="item.label" :type-flag="item.typeFlag"></ModuleShowHide>
              </el-col>
            </template>
          </el-row>
        </el-form>
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
  import { AppModules } from '@/core/App'
  import ModuleShowHide from './ModuleShowHide/index.vue'
  import AutoLanch from './AutoLanch/index.vue'
  import AutoHide from './AutoHide/index.vue'
  import AutoStartService from './AutoStartService/index.vue'
  import { I18nT } from '@lang/index'
</script>
