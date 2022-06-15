<template>
  <el-select v-model="currentBrewSrc" placeholder="请选择Brew下载源">
    <template v-for="(label, value) in brewSrc" :key="value">
      <el-option :label="label" :value="value"></el-option>
    </template>
  </el-select>
  <el-button
    :loading="brewRunning"
    :disabled="running || !currentBrewSrc || brewRunning || currentBrewSrc === brewStoreSrc"
    @click="changeBrewSrc"
    >切换</el-button
  >
</template>

<script>
  import { mapGetters } from 'vuex'
  import IPC from '@/util/IPC.js'
  export default {
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
      ...mapGetters('brew', {
        brewRunning: 'brewRunning',
        brewStoreSrc: 'brewSrc'
      })
    },
    created: function () {
      this.running = true
      this.$store.commit('brew/SET_BREW_SRC', '')
      IPC.send('app-fork:brew', 'currentSrc').then((key, info) => {
        IPC.off(key)
        console.log('info: ', info)
        if (info.data) {
          this.currentBrewSrc = info.data
          this.$store.commit('brew/SET_BREW_SRC', info.data)
        }
        this.running = false
      })
    },
    methods: {
      changeBrewSrc() {
        console.log('currentBrewSrc: ', this.currentBrewSrc)
        this.$store.commit('brew/SET_BREW_RUNNING', true)
        IPC.send('app-fork:brew', 'changeSrc', this.currentBrewSrc).then((key, info) => {
          IPC.off(key)
          console.log('info: ', info)
          if (info.code === 0) {
            this.$store.commit('brew/SET_BREW_SRC', this.currentBrewSrc)
            this.$message.success('Brew源已切换')
          } else {
            this.currentBrewSrc = this.brewStoreSrc
            this.$message.error('Brew源切换失败')
          }
          this.$store.commit('brew/SET_BREW_RUNNING', false)
        })
      }
    }
  }
</script>
