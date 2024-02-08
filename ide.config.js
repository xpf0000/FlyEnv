/* 配置webpack出口文件路径 */
const path = require('path')
const resolve = (dir) => {
  return path.join(__dirname, dir)
}
module.exports = {
  resolve: {
    alias: {
      '@': resolve('src/render'),
      '@shared': resolve('src/shared'),
      '@web': resolve('web')
    }
  }
}
