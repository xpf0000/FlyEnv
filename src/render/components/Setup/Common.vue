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
            <el-form-item label="Tools">
              <el-switch v-model="common.showItem.Tools" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </div>
    <div class="plant-title">Brew源切换</div>
    <div class="main brew-src">
      <BrewSrc></BrewSrc>
    </div>
    <div class="plant-title">修复Github访问问题</div>
    <div class="main brew-src">
      <GitHubFix></GitHubFix>
    </div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import BrewSrc from './BrewSrc/index.vue'
  import GitHubFix from './GithubFix/index.vue'

  export default {
    components: { BrewSrc, GitHubFix },
    props: {},
    data() {
      return {}
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
    methods: {}
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
  }
</style>
