<template>
  <div class="plant-title">{{ $t('base.brewSrcSwitch') }}</div>
  <div class="main brew-src">
    <el-select v-model="currentBrewSrc" :disabled="!checkBrew()">
      <template v-for="(label, value) in brewSrc" :key="value">
        <el-option :label="srcLabel[value]" :value="value"></el-option>
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
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
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
      srcLabel() {
        return {
          default: I18nT('base.default'),
          tsinghua: I18nT('setup.tsinghua'),
          bfsu: I18nT('setup.bfsu'),
          tencent: I18nT('setup.tencent'),
          aliyun: I18nT('setup.aliyun'),
          ustc: I18nT('setup.ustc')
        }
      },
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
      IPC.send('app-fork:brew', 'currentSrc').then((key: string, info: any) => {
        IPC.off(key)
        console.log('info: ', info)
        if (info.data) {
          this.currentBrewSrc = info.data
          brewStore.brewSrc = info.data
        }
        this.running = false
      })
    },
    methods: {
      checkBrew() {
        return !!window.Server.BrewCellar
      },
      changeBrewSrc() {
        const brewStore = BrewStore()
        brewStore.brewRunning = true
        IPC.send('app-fork:brew', 'changeSrc', this.currentBrewSrc).then(
          (key: string, info: any) => {
            IPC.off(key)
            console.log('info: ', info)
            if (info.code === 0) {
              brewStore.brewSrc = this.currentBrewSrc
              MessageSuccess(this.$t('base.success'))
            } else {
              this.currentBrewSrc = this.brewStoreSrc
              MessageError(this.$t('base.fail'))
            }
            brewStore.brewRunning = false
          }
        )
      }
    }
  })
</script>
