<template>
  <div class="tool-timestamp">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">Timestamp</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="path-choose mt-20 mb-20" style="flex-direction: column; align-items: center">
          <span>Current Unix Timestamp</span>
          <span class="ml-30 current mt-20 mb-20" style="font-size: 50px">{{ current }}</span>
        </div>
        <div class="path-choose mt-20 mb-20">
          <div class="left">
            <el-input v-model="timestamp0" placeholder="Unix Timestamp"></el-input>
            <el-select v-model="flag0">
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
            <el-select v-model="flag1">
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
  export default {
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
      }
    }
  }
</script>

<style lang="scss">
  .tool-timestamp {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 20px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 140px;
          margin-top: 20px;
        }
        &.error {
          border: 2px solid #cc5441;
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;

        .current {
          color: #01cc74;
        }

        .left,
        .right {
          display: flex;
          align-items: center;
          flex: 1;
        }

        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 50px;
            margin-right: 30px;
            flex-shrink: 0;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }
</style>
