const fs = require('fs')
const path = require('path')

const dir = "F:\\abc"

console.log(fs.realpathSync(dir))
