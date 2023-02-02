const fs = require('fs')
const path = require('path')

export function getAllFile(fp, fullpath = true) {
  let arr = []
  if (!fs.existsSync(fp)) {
    return arr
  }
  if (fs.statSync(fp).isFile()) {
    return [fp]
  }
  let files = fs.readdirSync(fp)
  files.forEach(function (item) {
    let fPath = path.join(fp, item)
    let stat = fs.statSync(fPath)
    if (stat.isDirectory()) {
      let sub = getAllFile(fPath, fullpath)
      arr = arr.concat(sub)
    }
    if (stat.isFile()) {
      arr.push(fullpath ? fPath : item)
    }
  })
  return arr
}

export function getAllFileAsync(fp, fullpath = true) {
  return new Promise((resolve) => {
    fs.stat(fp, (_, stat) => {
      if (stat.isFile()) {
        resolve([fp])
      } else if (stat.isDirectory()) {
        let arr = []
        let subs = []
        fs.readdir(fp, (_, paths) => {
          paths.forEach((item, index) => {
            let fPath = path.join(fp, item)
            fs.stat(fPath, (_, stat) => {
              if (stat.isDirectory()) {
                subs.push(getAllFileAsync(fPath, fullpath))
              }
              if (stat.isFile()) {
                arr.push(fullpath ? fPath : item)
              }
              if (index === paths.length - 1) {
                if (subs.length > 0) {
                  Promise.all(subs).then((arrs) => {
                    arr = arr.concat(...arrs)
                    resolve(arr)
                  })
                } else {
                  resolve(arr)
                }
              }
            })
          })
        })
      }
    })
  })
}

export function getSubDir(fp, fullpath = true) {
  let arr = []
  if (!fs.existsSync(fp)) {
    return arr
  }
  const stat = fs.statSync(fp)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    try {
      let files = fs.readdirSync(fp)
      files.forEach(function (item) {
        let fPath = path.join(fp, item)
        if (fs.existsSync(fPath)) {
          let stat = fs.statSync(fPath)
          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            arr.push(fullpath ? fPath : item)
          }
        }
      })
    } catch (e) {
      console.log(e)
    }
  }
  return arr
}

export function chmod(fp, mode) {
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
      chmod(fPath, mode)
    }
  })
}

export function createFolder(fp) {
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

export function writeFileAsync(fp, content) {
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

export function readFileAsync(fp, encode = 'utf-8') {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(fp)) {
      reject(new Error(`文件不存在: ${fp}`))
    }
    fs.readFile(fp, encode, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}
