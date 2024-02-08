<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <el-button-group>
        <el-button style="padding-left: 30px; padding-right: 30px" @click="toAdd">{{
          $t('base.add')
        }}</el-button>
        <el-dropdown trigger="click" @command="handleCommand">
          <template #default>
            <el-button
              style="
                padding-left: 8px;
                padding-right: 8px;
                border-left-color: transparent !important;
              "
              :icon="More"
            ></el-button>
          </template>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :disabled="!canExport" command="export">{{
                $t('base.export')
              }}</el-dropdown-item>
              <el-dropdown-item command="import">{{ $t('base.import') }}</el-dropdown-item>
              <el-dropdown-item divided command="newProject">
                <el-popover :show-after="600" placement="bottom" trigger="hover" width="300px">
                  <template #reference>
                    <span>{{ $t('host.newProject') }}</span>
                  </template>
                  <template #default>
                    <p>{{ $t('host.newProjectTips') }}</p>
                  </template>
                </el-popover>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-button-group>
      <el-popover :show-after="600" placement="bottom" trigger="hover" width="300px">
        <template #reference>
          <li style="width: auto; padding: 0 15px; margin-left: 20px; margin-right: 10px">
            <span style="margin-right: 10px">hosts: </span>
            <el-switch v-model="hostsSet.write"></el-switch>
          </li>
        </template>
        <template #default>
          <p>{{ $t('base.hostsWriteTips') }}</p>
        </template>
      </el-popover>
      <li class="no-hover" style="width: auto; padding: 0 15px; margin-right: 10px">
        <el-button @click="openHosts">{{ $t('base.openHosts') }}</el-button>
      </li>
    </ul>
    <List></List>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import List from './ListTable.vue'
  import { AppStore } from '../../store/app'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '../../fn'
  import { More } from '@element-plus/icons-vue'

  const appStore = AppStore()

  const hostsSet = computed(() => {
    return appStore.config.setup.hosts
  })
  const hosts = computed(() => {
    return appStore.hosts
  })
  const canExport = computed(() => {
    return hosts?.value?.length > 0
  })

  const handleCommand = (command: 'export' | 'import' | 'newProject') => {
    console.log('handleCommand: ', command)
    switch (command) {
      case 'export':
        doExport()
        break
      case 'import':
        doImport()
        break
      case 'newProject':
        openCreateProject()
        break
    }
  }
  const doExport = () => {
    ElMessage.success(I18nT('base.success'))
  }
  const doImport = () => {
    ElMessage.success(I18nT('base.success'))
  }
  let HostsVM: any
  import('./Hosts.vue').then((res) => {
    HostsVM = res.default
  })

  let EditVM: any
  import('./Edit.vue').then((res) => {
    EditVM = res.default
  })
  const openHosts = () => {
    AsyncComponentShow(HostsVM).then()
  }
  const toAdd = () => {
    AsyncComponentShow(EditVM).then()
  }
  const openCreateProject = () => {
    import('./CreateProject/index.vue').then((res) => {
      AsyncComponentShow(res.default).then(({ dir, rewrite }: any) => {
        console.log('openCreateProject dir: ', dir)
        AsyncComponentShow(EditVM, {
          edit: {
            root: dir,
            nginx: {
              rewrite: rewrite
            }
          }
        }).then()
      })
    })
  }
</script>
