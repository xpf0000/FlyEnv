<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ $t('util.toolSSL') }}</span>
        <slot name="like"></slot>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">{{
        $t('base.generate')
      }}</el-button>
    </div>

    <div class="main-wapper">
      <div class="main">
        <textarea
          v-model.trim="item.domains"
          type="text"
          :class="'input-textarea' + (errs['domains'] ? ' error' : '')"
          placeholder="domains eg: *.xxx.com, One domain name per line"
        ></textarea>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['root'] ? ' error' : '')"
            readonly="readonly"
            placeholder="Root CA certificate path, if not choose, will create new in SSL certificate save path"
            :value="item.root"
          />
          <div class="icon-block" @click="chooseRoot('root', true)">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            :class="'input' + (errs['savePath'] ? ' error' : '')"
            readonly="readonly"
            placeholder="SSL certificate save path"
            :value="item.savePath"
          />
          <div class="icon-block" @click="chooseRoot('save')">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { uuid } from '@shared/utils.ts'
  import { MessageError } from '@/util/Element.ts'

  const { existsSync, writeFileSync } = require('fs')
  const { execSync } = require('child_process')
  const { join, basename } = require('path')
  const { EOL } = require('os')
  const { dialog, shell } = require('@electron/remote')

  export default {
    name: 'MoSslMake',
    components: {},
    props: {},
    data() {
      return {
        running: false,
        item: {
          domains: '',
          root: '',
          savePath: ''
        },
        edit: {},
        errs: {
          domains: false,
          root: false,
          savePath: false
        }
      }
    },
    computed: {},
    watch: {
      item: {
        handler() {
          for (let k in this.errs) {
            this.errs[k] = false
          }
        },
        immediate: true,
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      chooseRoot(flag, choosefile = false) {
        let opt = ['openDirectory', 'createDirectory']
        let filters = []
        if (choosefile) {
          opt = ['openFile']
          filters.push({ name: 'ROOT CA Certificate', extensions: ['crt'] })
        }
        dialog
          .showOpenDialog({
            properties: opt,
            filters: filters
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
              case 'save':
                this.item.savePath = path
                break
            }
          })
      },
      checkItem() {
        this.errs.domains = this.item.domains.length === 0
        this.errs.savePath = this.item.savePath.length === 0

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
        let domains = this.item.domains
          .split('\n')
          .map((item) => {
            return item.trim()
          })
          .filter((item) => {
            return item && item.length > 0
          })
        let saveName = uuid(6) + '.' + domains[0].replace('*.', '')
        let caFile = this.item.root
        let caFileName = basename(caFile)
        if (caFile.length === 0) {
          caFile = join(this.item.savePath, uuid(6) + '.RootCA.crt')
          caFileName = basename(caFile)
        }
        caFile = caFile.replace('.crt', '')
        caFileName = caFileName.replace('.crt', '')
        let opt = { cwd: this.item.savePath }
        if (!existsSync(caFile + '.crt')) {
          let command = `openssl genrsa -out ${caFileName}.key 2048;`
          command += `openssl req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=Dev Root CA ${caFileName}";`
          command += `echo "basicConstraints=CA:true" > ${caFileName}.cnf;`
          command += `openssl x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650;`
          execSync(command, opt)
        }
        let ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]${EOL}`
        domains.forEach((item, index) => {
          ext += `DNS.${index + 1} = ${item}${EOL}`
        })
        ext += `IP.1 = 127.0.0.1${EOL}`
        writeFileSync(join(this.item.savePath, `${saveName}.ext`), ext)

        let command = `openssl req -new -newkey rsa:2048 -nodes -keyout ${saveName}.key -out ${saveName}.csr -sha256 -subj "/CN=${saveName}";`
        command += `openssl x509 -req -in ${saveName}.csr -out ${saveName}.crt -extfile ${saveName}.ext -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -sha256 -days 3650;`
        execSync(command, opt)
        if (existsSync(join(this.item.savePath, `${saveName}.crt`))) {
          this.$alert(this.$t('base.sslMakeAlert', { caFileName }), this.$t('base.prompt'), {
            confirmButtonText: this.$t('base.confirm'),
            callback: () => {
              this.doClose()
              shell.showItemInFolder(`${caFile}.crt`)
            }
          })
        } else {
          this.running = false
          MessageError(this.$t('base.fail'))
        }
      }
    }
  }
</script>
