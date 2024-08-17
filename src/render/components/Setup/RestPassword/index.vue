<template>
  <el-form-item :label="$t('base.resetPassword')" label-position="left" label-width="110">
    <el-space wrap>
      <el-input
        v-model="password"
        type="password"
        show-password
        placeholder="Please input password"
        style="width: 255px"
      />
    </el-space>
  </el-form-item>

  <!-- <div class="plant-title">{{ $t('base.resetPassword') }}</div>
  <div class="main reset-pass">
    <el-input
      v-if="show"
      v-model="password"
      type="text"
      placeholder="Please input password"
      readonly
    />
    <el-input
      v-else
      v-model="password"
      type="password"
      placeholder="Please input password"
      readonly
    />
    <el-button-group>
      <el-button @click="show = !show">
        <yb-icon v-if="show" :svg="import('@/svg/eye.svg?raw')" :width="15" :height="15"></yb-icon>
        <yb-icon v-else :svg="import('@/svg/eye-slash.svg?raw')" :width="15" :height="15"></yb-icon>
      </el-button>
      <el-button @click="resetPassword">
        <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" :width="15" :height="15"></yb-icon>
      </el-button>
    </el-button-group>
  </div> -->
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { AppStore } from '@/store/app'

  const store = AppStore()

  watch(
    () => store.config.password,
    () => {
      store.saveConfig()
    },
    { deep: true }
  )

  const password = computed({
    get: () => store.config.password,
    set: (v) => {
      store.config.password = v
    }
  })
</script>
