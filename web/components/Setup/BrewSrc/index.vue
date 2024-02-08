<template>
  <div class="plant-title">{{ $t('base.brewSrcSwitch') }}</div>
  <div class="main brew-src">
    <el-select v-model="currentBrewSrc" :disabled="!checkBrew()">
      <template v-for="(label, value) in brewSrc" :key="value">
        <el-option
          :label="value === 'default' ? $t(`base.${value}`) : label"
          :value="value"
        ></el-option>
      </template>
    </el-select>
    <el-button
      :loading="brewRunning"
      :disabled="
        !checkBrew() || running || !currentBrewSrc || brewRunning || currentBrewSrc === brewStoreSrc
      "
      @click="changeBrewSrc"
      >{{ $t('base.switch') }}</el-button
    >
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { BrewStore } from '@web/store/brew'
  import { MessageSuccess } from '@/util/Element'
  import { waitTime } from '@web/fn'
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        brewSrc: {
          default: '默认',
          tsinghua: '清华大学下载源',
          bfsu: '北京外国语大学下载源',
          tencent: '腾讯下载源',
          aliyun: '阿里巴巴下载源',
          ustc: '中国科学技术大学下载源'
        },
        currentBrewSrc: '',
        running: false
      }
    },
    computed: {
      brewRunning() {
        return BrewStore().brewRunning
      },
      brewStoreSrc() {
        return BrewStore().brewSrc
      }
    },
    created: function () {
      const brewStore = BrewStore()
      this.running = true
      brewStore.brewSrc = ''
    },
    methods: {
      checkBrew() {
        return true
      },
      async changeBrewSrc() {
        const brewStore = BrewStore()
        brewStore.brewRunning = true
        await waitTime()
        brewStore.brewSrc = this.currentBrewSrc
        MessageSuccess(this.$t('base.success'))
      }
    }
  })
</script>
