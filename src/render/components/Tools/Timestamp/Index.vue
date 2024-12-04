<template>
  <div class="tool-timestamp tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolTimestamp') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="path-choose mt-20 mb-20" style="flex-direction: column; align-items: center">
          <span>Current Unix Timestamp</span>
          <span
            class="ml-30 current mt-20 mb-20"
            style="font-size: 50px"
            @dblclick.stop="doCopy(current)"
            >{{ current }}</span
          >
        </div>
        <div class="path-choose mt-20 mb-20">
          <div class="left">
            <el-input v-model="timestamp0" placeholder="Unix Timestamp"></el-input>
            <el-select v-model="flag0" class="w-32 max-w-32">
              <el-option :value="0" :label="$t('base.second')"></el-option>
              <el-option :value="1" :label="$t('base.millisecond')"></el-option>
            </el-select>
          </div>
          <yb-icon
            :svg="import('@/svg/back.svg?raw')"
            width="24"
            height="24"
            style="transform: rotate(180deg); flex-shrink: 0; margin: 0 40px"
          />
          <div class="right">
            <el-input :value="datetime0" readonly placeholder="Date time string"></el-input>
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <div class="left">
            <el-date-picker
              v-model="timestamp1"
              class="w-p100"
              type="datetime"
              value-format="x"
              placeholder="Date time"
            />
          </div>
          <yb-icon
            :svg="import('@/svg/back.svg?raw')"
            width="24"
            height="24"
            style="transform: rotate(180deg); flex-shrink: 0; margin: 0 40px"
          />
          <div class="right">
            <el-input v-model="timestamp1str" readonly placeholder="Unix Timestamp"></el-input>
            <el-select v-model="flag1" class="w-32 max-w-32">
              <el-option :value="0" :label="$t('base.second')"></el-option>
              <el-option :value="1" :label="$t('base.millisecond')"></el-option>
            </el-select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { MessageSuccess } from '@/util/Element.ts'
  import { I18nT } from '@shared/lang/index.ts'

  const { clipboard } = require('@electron/remote')
  export default {
    name: 'MoUnixTimestamp',
    components: {},
    props: {},
    emits: ['doClose'],
    data() {
      return {
        current: 0,
        flag0: 0,
        flag1: 0,
        timestamp0: null,
        timestamp1: null
      }
    },
    computed: {
      datetime0() {
        if (!this.timestamp0) {
          return ''
        }
        let t = parseInt(this.timestamp0)
        if (this.flag0 === 0) {
          t = t * 1000
        }
        console.log('t: ', t)
        let unixTimestamp = new Date(t)
        return unixTimestamp.toLocaleString()
      },
      timestamp1str() {
        if (this.timestamp1 === null) {
          return ''
        }
        let t = this.timestamp1
        if (this.flag1 === 0) {
          t = t / 1000
        }
        return t
      }
    },
    watch: {},
    created: function () {
      this.getCurrent()
      this.timer = setInterval(() => {
        this.getCurrent()
      }, 1000)
    },
    unmounted() {
      console.log('timestamp destroyed !!!!!')
      clearInterval(this.timer)
    },
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      getCurrent() {
        this.current = Math.round(new Date().getTime() / 1000)
      },
      doCopy(str) {
        clipboard.writeText(`${str}`)
        MessageSuccess(I18nT('base.copySuccess'))
      }
    }
  }
</script>
