<script setup lang="ts">
  import Store from './store'
  import { CopyDocument } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.hash-text-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="main p-0">
          <el-card>
            <el-form-item label="Your text to hash:" label-position="top">
              <el-input
                v-model="Store.text"
                type="textarea"
                multiline
                placeholder="Your string to hash..."
                rows="4"
                autosize
                autofocus
              />
            </el-form-item>

            <el-form-item label="Digest encoding" label-position="top">
              <el-select v-model="Store.digest" class="mb-4 w-full">
                <template v-for="(item, _index) in Store.digestList" :key="_index">
                  <el-option :value="item.value" :label="item.label"></el-option>
                </template>
              </el-select>
            </el-form-item>

            <div v-for="(item, algo) in Store.algoList" :key="algo" style="margin: 5px 0">
              <el-input :model-value="Store.hashText(algo)">
                <template #prepend
                  ><div class="flex items-center w-16">{{ algo }}</div></template
                >
                <template #suffix>
                  <el-button link :icon="CopyDocument" @click.stop="Store.copy(algo)"></el-button>
                </template>
              </el-input>
            </div>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
