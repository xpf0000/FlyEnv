<template>
  <div class="setup-common">
    <div class="plant-title">显示项目</div>
    <div class="main">
      <el-form label-position="left" label-width="100px">
        <el-row>
          <el-col :span="8">
            <el-form-item label="Hosts">
              <el-switch v-model="common.showItem.Hosts" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Nginx">
              <el-switch v-model="common.showItem.Nginx" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Apache">
              <el-switch v-model="common.showItem.Apache" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Mysql">
              <el-switch v-model="common.showItem.Mysql" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Php">
              <el-switch v-model="common.showItem.Php" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Memcached">
              <el-switch v-model="common.showItem.Memcached" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Redis">
              <el-switch v-model="common.showItem.Redis" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="NodeJS">
              <el-switch v-model="common.showItem.NodeJS" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Http Serve">
              <el-switch v-model="common.showItem.HttpServe" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Tools">
              <el-switch v-model="common.showItem.Tools" />
            </el-form-item>
          </el-col>
          <el-col :span="8"> </el-col>
          <el-col :span="8"> </el-col>
        </el-row>
      </el-form>
    </div>
    <div class="plant-title">Brew源切换</div>
    <div
      v-tour="{
        position: 'top',
        group: 'custom',
        index: 6,
        count: 7,
        title: '使用指引',
        component: Step7,
        onPre: onStep7Pre
      }"
      class="main brew-src"
    >
      <BrewSrc></BrewSrc>
    </div>
    <div class="plant-title">修复Github访问问题</div>
    <div class="main brew-src">
      <GitHubFix></GitHubFix>
    </div>
    <div class="plant-title">代理设置</div>
    <div class="main proxy-set">
      <ProxySet></ProxySet>
    </div>
    <div class="plant-title">重设电脑密码</div>
    <div class="main reset-pass">
      <RestPassword></RestPassword>
    </div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import BrewSrc from './BrewSrc/index.vue'
  import GitHubFix from './GithubFix/index.vue'
  import RestPassword from './RestPassword/index.vue'
  import { EventBus } from '@/global.js'
  import { markRaw, nextTick, toRaw } from 'vue'
  import { TourCenter } from '@/core/directive/Tour/index.ts'
  import Step7 from '@/components/Tour/Step7.vue'
  import ProxySet from './ProxySet/index.vue'

  export default {
    components: { BrewSrc, GitHubFix, RestPassword, ProxySet },
    props: {},
    data() {
      return {
        Step7: markRaw(toRaw(Step7))
      }
    },
    computed: {
      ...mapGetters('app', {
        config: 'config'
      }),
      common() {
        return this.config?.setup?.common ?? {}
      }
    },
    watch: {
      'common.showItem': {
        handler() {
          this.$store.dispatch('app/saveConfig')
        },
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {
      onStep7Pre() {
        return new Promise((resolve) => {
          TourCenter.poper.style.opacity = 0.0
          EventBus.emit('TourStep', 7)
          nextTick().then(() => {
            resolve(true)
          })
        })
      }
    }
  }
</script>

<style lang="scss">
  .setup-common {
    .plant-title {
      padding: 22px 24px;
      font-size: 15px;
      font-weight: 600;
    }
    .main {
      background: #32364a;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      .el-form-item--default {
        margin-top: 12px !important;
        margin-bottom: 12px !important;
        justify-content: center;

        .el-form-item__label {
          padding-right: 20px !important;
        }

        .el-form-item__content {
          flex: unset !important;
        }
      }
    }

    .main.brew-src {
      padding: 30px 20px;
      flex-direction: row;
      align-items: center;

      > .el-select {
        margin-right: 20px;
      }
    }

    .main.proxy-set {
      padding-bottom: 30px;

      .el-form-item__content {
        width: 100%;
      }

      .el-form-item--default {
        justify-content: flex-start;
        margin-top: 20px !important;
        margin-bottom: 0 !important;

        &:first-of-type {
          margin-top: 0 !important;
        }
      }
    }

    .main.reset-pass {
      padding: 30px 20px;
      flex-direction: row;
      align-items: center;

      > .el-input {
        margin-right: 10px;
        width: 198px;
      }
    }
  }
</style>
