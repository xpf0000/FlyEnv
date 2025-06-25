/* Configure webpack output file path */
const path = require('path')
const resolve = (dir) => {
  return path.join(__dirname, dir)
}
module.exports = {
  module: 'esnext',
  resolve: {
    alias: {
      '@': resolve('src/render'),
      '@shared': resolve('src/shared'),
      '@lang': resolve('src/lang'),
      '@web': resolve('web')
    }
  }
}
