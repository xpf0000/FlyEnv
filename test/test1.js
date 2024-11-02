const fs = require('fs')
const path = require('path')

const content = fs.readFileSync(path.join(__dirname, 'stdout'), 'ucs-2')
const obj = {
  content
}
console.log(obj)
