<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolSSL') }}</span>
        <slot name="like"></slot>
      </div>
      <el-button type="primary" class="shrink0" :loading="running" @click="doSave">{{
        I18nT('base.generate')
      }}</el-button>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper">
        <div class="main flex flex-col gap-7 pt-7">
          <el-input
            v-model.trim="item.domains"
            type="textarea"
            :rows="6"
            resize="none"
            placeholder="Domains (Example: *.mydomain.tld), separated by line."
            :style="{
              '--el-input-border-color': errs['domains'] ? '#cc5441' : null
            }"
          ></el-input>

          <el-input
            v-model="item.root"
            :style="{
              '--el-input-border-color': errs['root'] ? '#cc5441' : null
            }"
            placeholder="Root CA certificate path, if not choose, will create new in SSL certificate save path"
          >
            <template #append>
              <el-button :icon="FolderOpened" @click.stop="chooseRoot('root', true)"></el-button>
            </template>
          </el-input>

          <el-input
            v-model="item.savePath"
            :style="{
              '--el-input-border-color': errs['savePath'] ? '#cc5441' : null
            }"
            placeholder="SSL certificate save path"
          >
            <template #append>
              <el-button :icon="FolderOpened" @click.stop="chooseRoot('save')"></el-button>
            </template>
          </el-input>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { join, basename } from '@/util/path-browserify'
  import { uuid } from '@/util/Index'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { dialog, shell, fs, exec } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'
  import Base from '@/core/Base'
  import IPC from '@/util/IPC'
  import { FolderOpened } from '@element-plus/icons-vue'

  interface SSLItem {
    domains: string
    root: string
    savePath: string
  }

  interface Errors {
    domains: boolean
    root: boolean
    savePath: boolean
  }

  const EOL = '\n'

  // Reactive state
  const running = ref(false)
  const item = ref<SSLItem>({
    domains: '',
    root: '',
    savePath: ''
  })
  const errs = ref<Errors>({
    domains: false,
    root: false,
    savePath: false
  })

  // Watch for changes to reset errors
  watch(
    item,
    () => {
      for (const k in errs.value) {
        errs.value[k as keyof Errors] = false
      }
    },
    { deep: true, immediate: true }
  )

  const chooseRoot = async (flag: 'root' | 'save', choosefile = false) => {
    let opt = ['openDirectory', 'createDirectory']
    const filters = []
    if (choosefile) {
      opt = ['openFile']
      filters.push({ name: 'ROOT CA Certificate', extensions: ['crt'] })
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: opt,
      filters: filters.length ? filters : undefined
    })

    if (canceled || filePaths.length === 0) return

    const [path] = filePaths
    if (flag === 'root') {
      item.value.root = path
    } else if (flag === 'save') {
      item.value.savePath = path
    }
  }

  const checkItem = (): boolean => {
    errs.value.domains = item.value.domains.length === 0
    errs.value.savePath = item.value.savePath.length === 0

    return !Object.values(errs.value).some((error) => error)
  }

  const doSave = async () => {
    if (!checkItem()) return
    running.value = true
    if (window.Server.isWindows) {
      IPC.send('app-fork:tools', 'sslMake', JSON.parse(JSON.stringify(item.value))).then(
        (key: string, res: any) => {
          IPC.off(key)
          running.value = false
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            shell.openPath(item.value.savePath)
          } else {
            MessageError(I18nT('base.fail'))
          }
        }
      )
      return
    }
    try {
      const domains = item.value.domains
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)

      const saveName = uuid(6) + '.' + domains[0].replace('*.', '')
      let caFile = item.value.root
      let caFileName = basename(caFile)

      if (caFile.length === 0) {
        caFile = join(item.value.savePath, uuid(6) + '.RootCA.crt')
        caFileName = basename(caFile)
      }

      caFile = caFile.replace('.crt', '')
      caFileName = caFileName.replace('.crt', '')
      const opt = { cwd: item.value.savePath }

      let exists = await fs.existsSync(caFile + '.crt')
      if (!exists) {
        let command = `openssl genrsa -out "${caFileName}.key" 2048;`
        command += `openssl req -new -key "${caFileName}.key" -out "${caFileName}.csr" -sha256 -subj "/CN=Dev Root CA ${caFileName}";`
        command += `echo "basicConstraints=CA:true" > "${caFileName}.cnf";`
        command += `openssl x509 -req -in "${caFileName}.csr" -signkey "${caFileName}.key" -out "${caFileName}.crt" -extfile "${caFileName}.cnf" -sha256 -days 3650;`
        await exec.exec(command, opt)
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
      await fs.writeFile(join(item.value.savePath, `${saveName}.ext`), ext)

      let command = `openssl req -new -newkey rsa:2048 -nodes -keyout "${saveName}.key" -out "${saveName}.csr" -sha256 -subj "/CN=${saveName}";`
      command += `openssl x509 -req -in "${saveName}.csr" -out "${saveName}.crt" -extfile "${saveName}.ext" -CA "${caFile}.crt" -CAkey "${caFile}.key" -CAcreateserial -sha256 -days 3650;`
      await exec.exec(command, opt)

      exists = await fs.existsSync(join(item.value.savePath, `${saveName}.crt`))
      if (exists) {
        Base.Alert(I18nT('base.sslMakeAlert', { caFileName }), I18nT('base.prompt'))
          .then(() => {
            shell.showItemInFolder(`${caFile}.crt`)
          })
          .catch()
      } else {
        MessageError(I18nT('base.fail'))
      }
    } catch (error) {
      console.error('Error generating SSL:', error)
      MessageError(I18nT('base.fail'))
    } finally {
      running.value = false
    }
  }
</script>
