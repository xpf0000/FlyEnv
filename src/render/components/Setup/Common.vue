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
      <div class="plant-title">{{ $t('base.showItem') }}</div>
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
        </div>
      </div>
      <ProxySet />
      <div class="row-2">
        <div class="col">
          <div class="plant-title force-start-plant">
            <span>{{ $t('base.about') }}</span>
          </div>
          <div class="main reset-pass">
            <el-button @click.stop="showAbout">{{ $t('base.about') }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
import ProxySet from './ProxySet/index.vue'
import LangSet from './LangSet/index.vue'
import ForceStart from './ForceStart/index.vue'
import ThemeSet from './Theme/index.vue'
import Base from '@/core/Base'
import { I18nT } from '@shared/lang'
import Tool from './Tool/index.vue'
import AI from './AI/index.vue'
import { AppModules } from '@/core/App'
import ModuleShowHide from './ModuleShowHide/index.vue'

const showAbout = () => {
  Base.Dialog(import('@/components/About/index.vue'))
    .className('about-dialog')
    .title(I18nT('base.about'))
    .width('665px')
    .noFooter()
    .show()
}

</script>
