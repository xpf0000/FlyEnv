<template>
  <el-form-item :label="$t('base.other')" label-position="left" label-width="110">
    <el-space wrap>
      <el-button link @click.stop="showAbout">{{ $t('base.about') }}</el-button>
    </el-space>
  </el-form-item>
</template>

<script lang="ts" setup>
  import Base from '@/core/Base'
  import { I18nT } from '@shared/lang'
  const showAbout = () => {
    Base.Dialog(import('@/components/About/index.vue'))
      .className('about-dialog')
      .title(I18nT('base.about'))
      .width('665px')
      .noFooter()
      .show()
  }
</script>
