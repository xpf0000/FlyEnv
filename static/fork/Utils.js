const axios = require('axios')
const path = require('path')
const fs = require('fs')

class Utils {
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
}

module.exports = Utils
