<template>
  <el-select v-model="currentBrewSrc">
    <template v-for="(label, value) in brewSrc" :key="value">
      <el-option
        :label="value === 'default' ? $t(`base.${value}`) : label"
        :value="value"
      ></el-option>
    </template>
  </el-select>
  <el-button
    :loading="brewRunning"
    :disabled="running || !currentBrewSrc || brewRunning || currentBrewSrc === brewStoreSrc"
    @click="changeBrewSrc"
    >{{ $t('base.switch') }}</el-button
  >
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { waitTime } from '../../../fn'
  import { BrewStore } from '../../../store/brew'
  import { ElMessage } from 'element-plus'
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
      brewStore.brewSrc = 'default'
      this.currentBrewSrc = 'default'
      this.running = false
    },
    methods: {
      changeBrewSrc() {
        const brewStore = BrewStore()
        brewStore.brewRunning = true
        waitTime().then(() => {
          brewStore.brewSrc = this.currentBrewSrc
          brewStore.brewRunning = false
          ElMessage.success(this.$t('base.success'))
        })
      }
    }
  })
</script>
