<template>
  <div class="nav-show">
    <el-form-item :label="$t('base.showItem')" label-position="left" label-width="110">
      <el-button v-if="isVisable.show" link @click="isVisable.show = !isVisable.show">
        {{ $t('base.foldOpen') }}
        <el-icon class="el-icon--right"><arrow-up /></el-icon>
      </el-button>
      <el-button v-else link @click="isVisable.show = !isVisable.show">
        {{ $t('base.foldHidden') }}
        <el-icon class="el-icon--right"><arrow-down /></el-icon>
      </el-button>
    </el-form-item>
    <div v-if="isVisable.show" class="show-content">
      <el-form label-position="left" label-width="100px">
        <el-row>
          <el-col :span="8">
            <el-form-item label="Hosts">
              <el-switch v-model="state.showItem.Hosts" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Apache">
              <el-switch v-model="state.showItem.Apache" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Nginx">
              <el-switch v-model="state.showItem.Nginx" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Caddy">
              <el-switch v-model="state.showItem.Caddy" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Php">
              <el-switch v-model="state.showItem.Php" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Mysql">
              <el-switch v-model="state.showItem.Mysql" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="MariaDB">
              <el-switch v-model="state.showItem.mariadb" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="MongoDB">
              <el-switch v-model="state.showItem.MongoDB" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="PostgreSql">
              <el-switch v-model="postgresqlShow" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Memcached">
              <el-switch v-model="state.showItem.Memcached" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Redis">
              <el-switch v-model="state.showItem.Redis" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="NodeJS">
              <el-switch v-model="state.showItem.NodeJS" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="8">
            <el-form-item label="Http Serve">
              <el-switch v-model="state.showItem.HttpServe" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="DNS Server">
              <el-switch v-model="state.showItem.DNS" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="FTP">
              <el-switch v-model="state.showItem.FTP" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="8">
            <el-form-item label="Tools">
              <el-switch v-model="state.showItem.Tools" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, watch } from 'vue'
  import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'

  const isVisable = reactive({
    show: false
  })

  const state = reactive({
    showItem: computed(() => AppStore().config.setup.common.showItem)
  })

  const postgresqlShow = computed({
    get: () => state.showItem.PostgreSql ?? true,
    set: (v) => {
      if (state.showItem) {
        state.showItem.PostgreSql = v
      }
    }
  })

  watch(state.showItem, () => {
    AppStore().saveConfig()
  })
</script>

<style lang="scss" scoped>
  .show-content {
    padding-left: 115px;
  }
</style>
