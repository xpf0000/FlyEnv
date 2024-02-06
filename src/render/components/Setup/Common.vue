<template>
  <div class="setup-common">
    <div class="plant-title">{{ $t('base.lang') }}</div>
    <div class="main brew-src">
      <LangeSet></LangeSet>
    </div>
    <div class="plant-title">{{ $t('base.showItem') }}</div>
    <div class="main user-select-none">
      <el-form label-position="left" label-width="100px">
        <el-row>
          <el-col :span="8">
            <el-form-item label="Hosts">
              <el-switch v-model="showItem.Hosts" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Apache">
              <el-switch v-model="showItem.Apache" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Nginx">
              <el-switch v-model="showItem.Nginx" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Php">
              <el-switch v-model="showItem.Php" />
            </el-form-item>
          </el-col>
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
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="MongoDB">
              <el-switch v-model="showItem.MongoDB" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="PostgreSql">
              <el-switch v-model="postgresqlShow" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Memcached">
              <el-switch v-model="showItem.Memcached" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Redis">
              <el-switch v-model="showItem.Redis" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="DNS Server">
              <el-switch v-model="showItem.DNS" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="FTP">
              <el-switch v-model="showItem.FTP" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
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
          <el-col :span="8">
            <el-form-item label="Tools">
              <el-switch v-model="showItem.Tools" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </div>
    <BrewSrc></BrewSrc>
    <MacPortsSrc></MacPortsSrc>
    <div class="plant-title">{{ $t('base.githubFixTitle') }}</div>
    <div class="main brew-src">
      <GitHubFix></GitHubFix>
    </div>
    <div class="plant-title">{{ $t('base.proxySetting') }}</div>
    <div class="main proxy-set">
      <ProxySet></ProxySet>
    </div>
    <ForceStart />
    <ShowAI />
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
  import ForceStart from './ForceStart/index.vue'
  import ShowAI from './AI/index.vue'
  import MacPortsSrc from './MacPortsSrc/index.vue'

  export default defineComponent({
    components: {
      BrewSrc,
      GitHubFix,
      RestPassword,
      ProxySet,
      LangeSet,
      AutoUpdate,
      ForceStart,
      ShowAI,
      MacPortsSrc
    },
    props: {},
    data() {
      return {}
    },
    computed: {
      showItem() {
        return AppStore().config.setup.common.showItem
      },
      postgresqlShow: {
        get() {
          return this?.showItem?.PostgreSql ?? true
        },
        set(v: boolean) {
          this.showItem.PostgreSql = v
        }
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
