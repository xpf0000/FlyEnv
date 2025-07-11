<script setup lang="ts">
  import Store from './store'
  import { I18nT } from '@lang/index'
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.encryption-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <el-card header="Encrypt">
              <div class="flex gap-3">
                <el-form-item label-position="top" label="Your text:" class="flex-1">
                  <el-input
                    v-model="Store.cypherInput"
                    type="textarea"
                    placeholder="The string to cypher"
                    :rows="5"
                    class="flex-1"
                  />
                </el-form-item>

                <div class="flex flex-1 flex-col gap-2">
                  <el-form-item label-position="top" label="Your secret key:">
                    <el-input v-model="Store.cypherSecret" clearable />
                  </el-form-item>
                  <el-form-item label-position="top" label="Encryption algorithm:">
                    <el-select v-model="Store.cypherAlgo" class="w-full">
                      <template v-for="(item, key) in Store.algos" :key="key">
                        <el-option :value="key" :label="key"></el-option>
                      </template>
                    </el-select>
                  </el-form-item>
                </div>
              </div>
              <el-form-item class="mt-5" label-position="top" label="Your text encrypted:">
                <el-input
                  :model-value="Store.cypherOutput()"
                  type="textarea"
                  :rows="3"
                  placeholder="Your string hash"
                  readonly
                ></el-input>
              </el-form-item>
            </el-card>
          </div>
          <div>
            <el-card header="Decrypt">
              <div class="flex gap-3">
                <el-form-item label-position="top" label="Your encrypted text:" class="flex-1">
                  <el-input
                    v-model="Store.decryptInput"
                    type="textarea"
                    placeholder="The string to cypher"
                    :rows="5"
                    class="flex-1"
                  />
                </el-form-item>
                <div class="flex flex-1 flex-col gap-2">
                  <el-form-item label-position="top" label="Your secret key:">
                    <el-input v-model="Store.decryptSecret" clearable />
                  </el-form-item>
                  <el-form-item label-position="top" label="Encryption algorithm:">
                    <el-select v-model="Store.decryptAlgo" class="w-full">
                      <template v-for="(item, key) in Store.algos" :key="key">
                        <el-option :value="key" :label="key"></el-option>
                      </template>
                    </el-select>
                  </el-form-item>
                </div>
              </div>
              <el-form-item class="mt-5" label="Your decrypted text:" label-position="top">
                <el-input
                  :model-value="Store.decryptOutput()"
                  type="textarea"
                  :rows="3"
                  placeholder="Your string hash"
                  readonly
                ></el-input>
              </el-form-item>
            </el-card>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
