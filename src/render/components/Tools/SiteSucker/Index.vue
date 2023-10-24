<template>
  <div class="ssl-make">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">Site Sucker</span>
      </div>
      <yb-icon :svg="import('@/svg/setup.svg?raw')" width="24" height="24" />
    </div>

    <div class="main-wapper">
      <div class="main">
        <div style="display: flex; align-items: center; margin-bottom: 12px">
          <el-input
            v-model="url"
            placeholder="Please input port"
            class="input-with-select"
          ></el-input>
          <el-button-group style="flex-shrink: 0">
            <el-button @click="doRun">
              <yb-icon :svg="import('@/svg/play.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button>
              <yb-icon :svg="import('@/svg/stop.svg?raw')" width="18" height="18" />
            </el-button>
          </el-button-group>
        </div>
        <div class="table-wapper">
          <el-table height="100%" :data="arr" size="default" style="width: 100%">
            <el-table-column type="selection" width="55" />
            <el-table-column prop="COMMAND" label="COMMAND"> </el-table-column>
            <el-table-column prop="PID" label="PID"> </el-table-column>
            <el-table-column prop="USER" label="USER"> </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import IPC from '@/util/IPC'

  const emit = defineEmits(['doClose'])

  const doClose = () => {
    emit('doClose')
  }

  const url = ref('')
  const arr = ref([])

  const doRun = () => {
    IPC.send('app-sitesucker-run', url.value).then((key: string, res: any) => {
      console.log(res)
    })
  }
</script>
