<template>
  <div class="setup-common">
    <div class="plant-title">{{ $t('base.lang') }}</div>
    <div class="main brew-src">
      <LangeSet></LangeSet>
    </div>
    <div class="plant-title">{{ $t('base.showItem') }}</div>
    <div class="main">
      <el-form label-position="left" label-width="100px">
        <el-row>
          <el-col :span="8">
            <el-form-item label="Hosts">
              <el-switch v-model="showItem.Hosts" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Nginx">
              <el-switch v-model="showItem.Nginx" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Apache">
              <el-switch v-model="showItem.Apache" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Mysql">
              <el-switch v-model="showItem.Mysql" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="MariaDB">
              <el-switch v-model="showItem.mariadb" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Php">
              <el-switch v-model="showItem.Php" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Memcached">
              <el-switch v-model="showItem.Memcached" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Redis">
              <el-switch v-model="showItem.Redis" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="MongoDB">
              <el-switch v-model="showItem.MongoDB" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="DNS Server">
              <el-switch v-model="showItem.DNS" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="NodeJS">
              <el-switch v-model="showItem.NodeJS" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Http Serve">
              <el-switch v-model="showItem.HttpServe" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Tools">
              <el-switch v-model="showItem.Tools" />
            </el-form-item>
          </el-col>
          <el-col :span="8"> </el-col>
          <el-col :span="8"> </el-col>
        </el-row>
      </el-form>
    </div>
    <div class="plant-title">{{ $t('base.brewSrcSwitch') }}</div>
    <div class="main brew-src">
      <BrewSrc></BrewSrc>
    </div>
    <div class="plant-title">{{ $t('base.githubFixTitle') }}</div>
    <div class="main brew-src">
      <GitHubFix></GitHubFix>
    </div>
    <div class="plant-title">{{ $t('base.proxySetting') }}</div>
    <div class="main proxy-set">
      <ProxySet></ProxySet>
    </div>
    <div class="plant-title">{{ $t('base.autoUpdate') }}</div>
    <div class="main reset-pass">
      <AutoUpdate></AutoUpdate>
    </div>
    <div class="plant-title">{{ $t('base.resetPassword') }}</div>
    <div class="main reset-pass">
      <RestPassword></RestPassword>
    </div>
  </div>
</template>

<script lang="ts">
  import BrewSrc from './BrewSrc/index.vue'
  import GitHubFix from './GithubFix/index.vue'
  import RestPassword from './RestPassword/index.vue'
  import ProxySet from './ProxySet/index.vue'
  import LangeSet from './Lang/index.vue'
  import AutoUpdate from './AutoUpdate/index.vue'
  import { AppStore } from '@/store/app'
  import { defineComponent } from 'vue'

  export default defineComponent({
    components: { BrewSrc, GitHubFix, RestPassword, ProxySet, LangeSet, AutoUpdate },
    props: {},
    data() {
      return {}
    },
    computed: {
      showItem() {
        return AppStore().config.setup.common.showItem
      }
    },
    watch: {
      showItem: {
        handler() {
          AppStore().saveConfig()
        },
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {}
  })
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
