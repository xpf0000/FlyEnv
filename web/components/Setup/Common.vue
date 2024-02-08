<template>
  <div class="setup-common">
    <div class="row-2">
      <div class="col">
        <LangeSet />
      </div>
      <div class="col">
        <theme-set />
      </div>
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
    <ProxySet />
    <div class="row-2">
      <div class="col">
        <BrewSrc />
      </div>
      <div class="col">
        <MacPortsSrc />
      </div>
    </div>
    <div class="row-2">
      <div class="col">
        <ForceStart />
      </div>
      <div class="col">
        <ShowAI />
      </div>
    </div>
    <div class="row-2">
      <div class="col">
        <AutoUpdate />
      </div>
      <div class="col">
        <RestPassword />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import BrewSrc from './BrewSrc/index.vue'
  import RestPassword from './RestPassword/index.vue'
  import ProxySet from './ProxySet/index.vue'
  import LangeSet from './Lang/index.vue'
  import AutoUpdate from './AutoUpdate/index.vue'
  import { AppStore } from '@web/store/app'
  import { defineComponent } from 'vue'
  import ForceStart from './ForceStart/index.vue'
  import ShowAI from './AI/index.vue'
  import MacPortsSrc from './MacPortsSrc/index.vue'
  import ThemeSet from './Theme/index.vue'

  export default defineComponent({
    components: {
      BrewSrc,
      RestPassword,
      ProxySet,
      LangeSet,
      AutoUpdate,
      ForceStart,
      ShowAI,
      MacPortsSrc,
      ThemeSet
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
        handler() {},
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {}
  })
</script>
