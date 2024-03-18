<template>
  <div class="json-parse host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">JSON解析</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="left">
          <div class="top"></div>
          <div ref="rawEditor" class="editor"></div>
        </div>
        <div class="center">
          <el-button :icon="Right"></el-button>
          <el-button :icon="Back"></el-button>
        </div>
        <div class="right">
          <div class="top">
            <el-select v-model="to">
              <el-option label="JSON" value="json"></el-option>
              <el-option label="PHP Array" value="php"></el-option>
              <el-option label="JavaScript" value="js"></el-option>
              <el-option label="TypeScript" value="ts"></el-option>
              <el-option label="YAML" value="yml"></el-option>
              <el-option label="XML" value="xml"></el-option>
            </el-select>
            <el-button>
              <yb-icon :svg="import('@/svg/asc1.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button>
              <yb-icon :svg="import('@/svg/desc1.svg?raw')" width="18" height="18" />
            </el-button>
          </div>
          <div ref="parseEditor" class="editor"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { Right, Back } from '@element-plus/icons-vue'

  const emit = defineEmits(['doClose'])
  const to = ref('json')
  const doClose = () => {
    emit('doClose')
  }
</script>
