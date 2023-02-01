<template>
  <div class="host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">添加站点</span>
      </div>
      <el-button :loading="running" :disabled="running" class="shrink0" @click="doSave"
        >保存</el-button
      >
    </div>

    <div class="main-wapper">
      <div class="main">
        <input
          v-model.trim="item.name"
          type="text"
          :class="'input' + (errs['name'] ? ' error' : '')"
          placeholder="name eg: www.xxx.com"
        />
        <textarea
          v-model.trim="item.alias"
          type="text"
          class="input-textarea"
          placeholder="alias eg: www.xxx.com"
        ></textarea>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['root'] ? ' error' : '')"
            placeholder="root path"
            readonly=""
            :value="item.root"
          />
          <div class="icon-block" @click="chooseRoot('root')">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
      </div>

      <div class="plant-title">PHP版本</div>
      <div class="main">
        <div class="port-set">
          <el-select
            v-model="item.phpVersion"
            :class="{ error: errs?.phpVersion }"
            class="w-p100"
            placeholder="请选择PHP版本"
          >
            <template v-for="(v, i) in phpVersions" :key="i">
              <el-option :value="v.num" :label="v.version"></el-option>
            </template>
          </el-select>
        </div>
      </div>

      <div class="plant-title">Port</div>
      <div class="main">
        <div class="port-set mb-20">
          <div class="port-type"> Nginx </div>
          <input
            v-model.number="item.port.nginx"
            type="number"
            :class="'input' + (errs['port_nginx'] ? ' error' : '')"
            placeholder="default: 80"
          />
        </div>

        <div class="port-set mb-20">
          <div class="port-type">
            <span>Apache</span>
            <el-popover placement="top-start" title="注意" :width="300" trigger="hover">
              <template #reference>
                <yb-icon
                  :svg="import('@/svg/question.svg?raw')"
                  width="12"
                  height="12"
                  style="margin-left: 5px"
                ></yb-icon>
              </template>
              <p>Apache各个站点和配置文件中监听的端口全部不能重复, 否则会导致apache无法启动</p>
              <p>此处设置的端口,会在站点vhost配置文件中添加端口监听,如果重复,请自行手动删除</p>
            </el-popover>
          </div>
          <input
            v-model.number="item.port.apache"
            type="number"
            :class="'input' + (errs['port_apache'] ? ' error' : '')"
            placeholder="default: 8080"
          />
        </div>
      </div>

      <div class="plant-title">SSL</div>

      <div class="main">
        <div class="ssl-switch">
          <span>SSL</span>
          <el-switch v-model="item.useSSL"></el-switch>
        </div>

        <div v-if="item.useSSL" class="path-choose mt-20">
          <input
            type="text"
            :class="'input' + (errs['cert'] ? ' error' : '')"
            placeholder="cert"
            readonly=""
            :value="item.ssl.cert"
          />
          <div class="icon-block" @click="chooseRoot('cert', true)">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>

        <div v-if="item.useSSL" class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['certkey'] ? ' error' : '')"
            placeholder="cert key"
            readonly=""
            :value="item.ssl.key"
          />
          <div class="icon-block" @click="chooseRoot('certkey', true)">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>

        <div v-if="item.useSSL" class="ssl-switch mb-20 mt-20">
          <span>Port</span>
        </div>

        <div v-if="item.useSSL" class="port-set port-ssl mb-20">
          <div class="port-type"> Nginx </div>
          <input
            v-model.number="item.port.nginx_ssl"
            type="number"
            :class="'input' + (errs['port_nginx_ssl'] ? ' error' : '')"
            placeholder="default: 443"
          />
        </div>

        <div v-if="item.useSSL" class="port-set port-ssl mb-20">
          <div class="port-type"> Apache </div>
          <input
            v-model.number="item.port.apache_ssl"
            type="number"
            :class="'input' + (errs['port_apache_ssl'] ? ' error' : '')"
            placeholder="default: 8443"
          />
        </div>
      </div>

      <div class="plant-title">
        <span>Nginx</span>
        <el-popover placement="top-start" title="注意" :width="300" trigger="hover">
          <template #reference>
            <yb-icon
              :svg="import('@/svg/question.svg?raw')"
              width="12"
              height="12"
              style="margin-left: 5px"
            ></yb-icon>
          </template>
          <p>此处设置Nginx的Url Rewrite, Apache请在项目文件中自行设置</p>
        </el-popover>
      </div>

      <div class="main">
        <el-select v-model="rewriteKey" placeholder="当前" @change="rewriteChange">
          <el-option v-for="key in rewrites" :key="key" :label="key" :value="key"> </el-option>
        </el-select>

        <textarea
          v-model.trim="item.nginx.rewrite"
          type="text"
          class="input-textarea nginx-rewrite"
          placeholder="url rewrite"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script>
  import { readFileAsync, getAllFileAsync } from '@shared/file.js'
  import { mapGetters } from 'vuex'
  import { AppMixins } from '@/mixins/AppMixins.js'
  import { passwordCheck } from '@/util/Brew.js'
  import { handleHost } from '@/util/Host.js'

  const { exec } = require('child-process-promise')
  const { dialog } = require('@electron/remote')
  const { accessSync, constants } = require('fs')
  const { join } = require('path')

  let rewrites = {}
  export default {
    name: 'MoHostEdit',
    components: {},
    mixins: [AppMixins],
    props: {},
    data() {
      return {
        running: false,
        item: {
          id: 0,
          name: '',
          alias: '',
          useSSL: false,
          ssl: {
            cert: '',
            key: ''
          },
          port: {
            nginx: 80,
            apache: 8080,
            nginx_ssl: 443,
            apache_ssl: 8443
          },
          nginx: {
            rewrite: ''
          },
          url: '',
          root: ''
        },
        edit: {},
        errs: {
          name: false,
          root: false,
          cert: false,
          certkey: false,
          port_nginx: false,
          port_apache: false,
          port_nginx_ssl: false,
          port_apache_ssl: false
        },
        isEdit: false,
        rewrites: [],
        rewriteKey: ''
      }
    },
    computed: {
      ...mapGetters('app', {
        hosts: 'hosts'
      }),
      ...mapGetters('brew', {
        php: 'php'
      }),
      phpVersions() {
        return this.php?.installed ?? []
      }
    },
    watch: {
      item: {
        handler() {
          for (let k in this.errs) {
            this.errs[k] = false
          }
        },
        immediate: true,
        deep: true
      },
      'item.name': function () {
        for (let h of this.hosts) {
          if (h.name === this.item.name && h.id !== this.item.id) {
            this.errs['name'] = true
            break
          }
        }
      }
    },
    created: function () {
      this.loadRewrite()
      this.item.id = new Date().getTime()
    },
    unmounted() {},
    methods: {
      rewriteChange(item) {
        if (!rewrites[item]) {
          let file = join(this.rewritePath, `${item}.conf`)
          readFileAsync(file).then((content) => {
            rewrites[item] = content
            this.item.nginx.rewrite = content
          })
        } else {
          this.item.nginx.rewrite = rewrites[item]
        }
      },
      loadRewrite() {
        this.rewritePath = join(global.Server.Static, 'rewrite')
        if (Object.keys(rewrites).length === 0) {
          getAllFileAsync(this.rewritePath, false).then((files) => {
            files = files.sort()
            for (let file of files) {
              let k = file.replace('.conf', '')
              rewrites[k] = ''
              this.rewrites.push(k)
            }
          })
        } else {
          this.rewrites.push(...Object.keys(rewrites))
        }
      },
      doClose() {
        console.log('doClose click !!!', this.$baseEventBus)
        this.$baseEventBus.emit('Host-Edit-Close')
      },
      chooseRoot(flag, choosefile = false) {
        let opt = ['openDirectory', 'createDirectory', 'showHiddenFiles']
        if (choosefile) {
          opt.push('openFile')
        }
        dialog
          .showOpenDialog({
            properties: opt
          })
          .then(({ canceled, filePaths }) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const [path] = filePaths
            switch (flag) {
              case 'root':
                this.item.root = path
                break
              case 'cert':
                this.item.ssl.cert = path
                break
              case 'certkey':
                this.item.ssl.key = path
                break
            }
          })
      },
      checkItem() {
        if (!Number.isInteger(this.item.port.nginx)) {
          this.errs['port_nginx'] = true
        }
        if (!Number.isInteger(this.item.port.apache)) {
          this.errs['port_apache'] = true
        }

        if (!this.item.phpVersion) {
          this.errs['phpVersion'] = true
        }

        if (this.item.useSSL) {
          if (!Number.isInteger(this.item.port.nginx_ssl)) {
            this.errs['port_nginx_ssl'] = true
          }
          if (!Number.isInteger(this.item.port.apache_ssl)) {
            this.errs['port_apache_ssl'] = true
          }
        }

        this.errs['name'] = this.item.name.length === 0
        this.errs['root'] = this.item.root.length === 0
        if (this.item.useSSL) {
          this.errs['cert'] = this.item.ssl.cert.length === 0
          this.errs['certkey'] = this.item.ssl.key.length === 0
        }
        for (let h of this.hosts) {
          if (h.name === this.item.name && h.id !== this.item.id) {
            this.errs['name'] = true
            break
          }
        }
        for (let k in this.errs) {
          if (this.errs[k]) {
            return false
          }
        }
        return true
      },
      doSave() {
        if (!this.checkItem()) {
          return
        }
        this.running = true
        let flag = this.isEdit ? 'edit' : 'add'
        let access = false
        try {
          accessSync('/private/etc/hosts', constants.R_OK | constants.W_OK)
          access = true
          console.log('可以读写')
        } catch (err) {
          console.error('无权访问')
        }
        passwordCheck().then(() => {
          if (!access) {
            exec(`echo '${this.password}' | sudo -S chmod 777 /private/etc`)
              .then(() => {
                return exec(`echo '${this.password}' | sudo -S chmod 777 /private/etc/hosts`)
              })
              .then(() => {
                handleHost(this.item, flag, this.edit).then(() => {
                  this.running = false
                })
              })
              .catch(() => {
                this.$message.error('操作失败,hosts文件权限不正确')
                this.running = false
              })
          } else {
            handleHost(this.item, flag, this.edit).then(() => {
              this.running = false
            })
          }
        })
      }
    }
  }
</script>

<style lang="scss">
  .password-prompt {
    background: #32364a !important;
    border: 1px solid #32364a !important;
    color: #fff !important;
    .el-message-box__message,
    .el-message-box__close {
      color: rgba(255, 255, 255, 0.7) !important;
    }
  }
  .host-edit {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 40px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 140px;
          margin-top: 20px;
        }
      }
      .el-select {
        &.error {
          .el-input__wrapper {
            box-shadow: 0 0 0 1px #cc5441 inset;
          }
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 70px;
            margin-right: 30px;
            flex-shrink: 0;
            display: flex;
            align-items: baseline;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }
</style>
