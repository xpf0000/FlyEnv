<script setup lang="ts">
import Store from './store'
import { I18nT } from '@lang/index'
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.jwt-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <el-card header="Encode">
            <div class="flex gap-3">
              <el-form-item label-position="top" label="Algorithm:" class="flex-1">
                <el-select
                  v-model="Store.algorithm"
                  class="w-full"
                  @change="Store.onAlgorithmChange()"
                >
                  <template v-for="item in Store.algorithms" :key="item">
                    <el-option :value="item" :label="item"></el-option>
                  </template>
                </el-select>
              </el-form-item>
              <el-form-item label-position="top" label="Secret:" class="flex-1">
                <el-input v-model="Store.secret" clearable @input="Store.createToken()" />
              </el-form-item>
            </div>

            <el-form-item label-position="top" label="Header:">
              <el-input
                v-model="Store.header"
                type="textarea"
                :rows="5"
                placeholder="JWT header JSON"
                @input="Store.createToken()"
              />
            </el-form-item>

            <el-form-item label-position="top" label="Payload:">
              <el-input
                v-model="Store.payload"
                type="textarea"
                :rows="8"
                placeholder="JWT payload JSON"
                @input="Store.createToken()"
              />
            </el-form-item>

            <el-alert v-if="Store.encodeError" :title="Store.encodeError" type="error" show-icon />

            <el-form-item class="mt-4" label-position="top" label="JWT:">
              <el-input v-model="Store.token" type="textarea" :rows="5" readonly />
            </el-form-item>

            <div class="flex justify-center">
              <el-button @click="Store.useCreatedToken()">Decode This Token</el-button>
            </div>
          </el-card>

          <el-card header="Decode">
            <div class="flex gap-3">
              <el-form-item label-position="top" label="Algorithm:" class="flex-1">
                <el-select v-model="Store.decodeAlgorithm" class="w-full" @change="Store.decode()">
                  <template v-for="item in Store.algorithms" :key="item">
                    <el-option :value="item" :label="item"></el-option>
                  </template>
                </el-select>
              </el-form-item>
              <el-form-item label-position="top" label="Secret:" class="flex-1">
                <el-input v-model="Store.decodeSecret" clearable @input="Store.decode()" />
              </el-form-item>
            </div>

            <el-form-item label-position="top" label="JWT:">
              <el-input
                v-model="Store.decodedToken"
                type="textarea"
                :rows="6"
                placeholder="Paste JWT here"
                @input="Store.decode()"
              />
            </el-form-item>

            <el-alert v-if="Store.decodeError" :title="Store.decodeError" type="error" show-icon />
            <el-alert
              v-else
              :title="Store.signatureValid ? 'Signature verified' : 'Signature invalid'"
              :type="Store.signatureValid ? 'success' : 'warning'"
              show-icon
            />

            <el-form-item class="mt-4" label-position="top" label="Header:">
              <el-input v-model="Store.decodedHeader" type="textarea" :rows="5" readonly />
            </el-form-item>

            <el-form-item label-position="top" label="Payload:">
              <el-input v-model="Store.decodedPayload" type="textarea" :rows="8" readonly />
            </el-form-item>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
