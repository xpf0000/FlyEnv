<template>
  <div class="nodejs-list">
    <div class="table-header">
      <div class="left"> </div>
    </div>
    <el-table v-loading="loading" :data="tableData">
      <el-table-column label="版本" prop="version">
        <template #header>
          <div class="w-p100 name-cell">
            <span>{{ $t('base.version') }}</span>
            <el-input v-model.trim="search" placeholder="search" clearable></el-input>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="当前使用" :prop="null" align="center">
        <template #default="scope">
          <template v-if="current === scope.row.version">
            <yb-icon class="current" :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
          </template>
        </template>
      </el-table-column>
      <el-table-column label="是否安装" :prop="null" align="center">
        <template #default="scope">
          <template v-if="scope.row.installed">
            <yb-icon
              class="installed"
              :svg="import('@/svg/select.svg?raw')"
              width="17"
              height="17"
            />
          </template>
        </template>
      </el-table-column>
      <el-table-column label="操作" :prop="null" align="center">
        <template #default="scope">
          <template v-if="scope.row.installed">
            <el-button type="primary" link>卸载</el-button>
          </template>
          <template v-else>
            <el-button type="primary" link>安装</el-button>
          </template>
        </template>
      </el-table-column>
      <template #empty></template>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, Ref } from 'vue'
  import IPC from '@/util/IPC'
  import { TaskStore } from '@/store/task'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import Base from '@/core/Base'

  const current = ref(I18nT('base.gettingVersion'))
  const localVersions: Ref<Array<any>> = ref([])

  const search = ref('')
  const taskStore = TaskStore()
  const task = computed(() => {
    return taskStore.node
  })
  const loading = computed(() => {
    return task.value.getVersioning
  })

  const tableData = computed(() => {
    const locals = localVersions.value.map((v) => {
      return {
        version: v,
        installed: true
      }
    })
    const remotas = task.value.versions
      .filter((a) => !localVersions?.value?.includes(a))
      .map((v) => {
        return {
          version: v,
          installed: false
        }
      })
    const list = [...locals, ...remotas]
    if (!search.value) {
      return list
    }
    return list.filter((v) => v.version.includes(search.value) || search.value.includes(v.version))
  })

  const checkNvm = () => {
    return new Promise((resolve, reject) => {
      if (task.value.NVM_DIR) {
        resolve(true)
        return
      }
      IPC.send('app-fork:node', 'nvmDir').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.data) {
          task.value.NVM_DIR = res.data
          resolve(true)
        } else {
          reject(new Error(I18nT('base.nvmDirNoFound')))
        }
      })
    })
  }

  const getAllVersion = () => {
    if (task.value.getVersioning || task.value.versions.length > 0) {
      return
    }
    task.value.btnTxt = I18nT('base.gettingVersion')
    task.value.getVersioning = true
    IPC.send('app-fork:node', 'allVersion', task.value.NVM_DIR).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.data) {
        task.value.versions = res.data
        task.value.getVersioning = false
        task.value.btnTxt = I18nT('base.switch')
      } else {
        task.value.btnTxt = I18nT('base.switch')
        task.value.getVersioning = false
        MessageError(I18nT('base.fail'))
      }
    })
  }

  const getLocalVersion = () => {
    IPC.send('app-fork:node', 'localVersion', task.value.NVM_DIR).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.data?.versions) {
        const list: any = res.data.versions
        localVersions.value.splice(0)
        localVersions.value.push(...list)
        current.value = res.data.current
      }
    })
  }

  const versionChange = (choose: any) => {
    task.value.isRunning = true
    task.value.btnTxt = I18nT('base.switching')
    IPC.send('app-fork:node', 'versionChange', task.value.NVM_DIR, choose).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          task.value.btnTxt = I18nT('base.switch')
          task.value.isRunning = false
          current.value = choose
          MessageSuccess(I18nT('base.success'))
        } else {
          task.value.btnTxt = I18nT('base.switch')
          task.value.isRunning = false
          MessageError(I18nT('base.fail'))
        }
      }
    )
  }

  const installNvm = () => {
    task.value.isRunning = true
    task.value.btnTxt = I18nT('base.installingNVM')
    IPC.send('app-fork:node', 'installNvm').then((key: string, res: any) => {
      IPC.off(key)
      task.value.isRunning = false
      if (res?.code === 0) {
        checkNvm().then(() => {
          getAllVersion()
        })
      } else {
        MessageError(I18nT('base.fail'))
      }
    })
  }

  checkNvm()
    .then(() => {
      if (task.value.versions.length === 0) {
        getAllVersion()
      }
      getLocalVersion()
    })
    .catch(() => {
      if (task.value.isRunning) {
        return
      }
      Base.ConfirmWarning(I18nT('base.nvmNoInstallTips')).then(() => {
        installNvm()
      })
    })
</script>
