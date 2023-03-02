const axios = require('axios')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const crypto = require('crypto')

class Utils {
  static getSubDir(fp, fullpath = true) {
    const arr = []
    if (!fs.existsSync(fp)) {
      return arr
    }
    const stat = fs.statSync(fp)
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      try {
        const files = fs.readdirSync(fp)
        files.forEach(function (item) {
          const fPath = path.join(fp, item)
          if (fs.existsSync(fPath)) {
            const stat = fs.statSync(fPath)
            if (stat.isDirectory() && !stat.isSymbolicLink()) {
              arr.push(fullpath ? fPath : item)
            }
          }
        })
      } catch (e) {}
    }
    return arr
  }
  static md5(str) {
    const md5 = crypto.createHash('md5')
    return md5.update(str).digest('hex')
  }
  static chmod(fp, mode) {
    if (fs.statSync(fp).isFile()) {
      fs.chmodSync(fp, mode)
      return
    }
    let files = fs.readdirSync(fp)
    files.forEach(function (item) {
      let fPath = path.join(fp, item)
      fs.chmodSync(fPath, mode)
      let stat = fs.statSync(fPath)
      if (stat.isDirectory() === true) {
        // eslint-disable-next-line no-undef
        Utils.chmod(fPath, mode)
      }
    })
  }
  static readFileAsync(fp, encode = 'utf-8') {
    return new Promise((resolve, reject) => {
      fs.readFile(fp, encode, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }
  static writeFileAsync(fp, content) {
    return new Promise((resolve, reject) => {
      fs.writeFile(fp, content, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    })
  }
  static createFolder(fp) {
    fp = fp.replace(/\\/g, '/')
    if (fs.existsSync(fp)) {
      return true
    }
    const arr = fp.split('/')
    let dir = '/'
    for (let p of arr) {
      dir = path.join(dir, p)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
      }
    }
    return fs.existsSync(fp)
  }
  static downFile(url, savepath) {
    return new Promise((resolve, reject) => {
      axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      })
        .then(function (response) {
          let base = path.dirname(savepath)
          Utils.createFolder(base)
          let stream = fs.createWriteStream(savepath)
          response.data.pipe(stream)
          stream.on('error', (err) => {
            reject(err)
          })
          stream.on('finish', () => {
            resolve(true)
          })
        })
        .catch((err) => {
          reject(err)
        })
    })
  }
  static execAsync(command, arg = [], options = {}) {
    return new Promise((resolve, reject) => {
      let optdefault = options
      if (!optdefault?.env) {
        optdefault.env = { ...process.env }
      } else {
        Object.assign(optdefault.env, process.env)
      }
      if (!optdefault.env['PATH']) {
        optdefault.env['PATH'] =
          '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      } else {
        optdefault.env[
          'PATH'
        ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:${optdefault.env['PATH']}`
      }
      if (global.Server.Proxy) {
        for (const k in global.Server.Proxy) {
          optdefault.env[k] = global.Server.Proxy[k]
        }
      }
      if (global.Server.isAppleSilicon) {
        arg.unshift('-arm64', command)
        command = 'arch'
      }
      const cp = spawn(command, arg, optdefault)
      let stdout = []
      let stderr = []
      cp.stdout.on('data', (data) => {
        stdout.push(data)
      })

      cp.stderr.on('data', (data) => {
        stderr.push(data)
      })

      cp.on('close', (code) => {
        const out = Buffer.concat(stdout)
        const err = Buffer.concat(stderr)
        if (code === 0) {
          resolve(out.toString().trim())
        } else {
          reject(new Error(err.toString().trim()))
        }
      })
    })
  }
}

module.exports = Utils
