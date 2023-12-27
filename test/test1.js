const { fork } = require('child_process')

const names = [
  'php',
  'nginx',
  'pure-ftpd',
  'apache',
  'memcached',
  'mysql',
  'mariadb',
  'redis',
  'mongodb',
  'postgresql'
]

let count = 0
// const child = fork('./sub.js')
// const child = fork('./subSync.js')

const child1 = fork('./subSync.js')
const child2 = fork('./subSync.js')
// const child3 = fork('./sub.js')
// const child4 = fork('./sub.js')

const onData = (num) => {
  console.log('child on message: ', num)
  count += 1
  if (count === names.length) {
    console.timeEnd('Test')
  }
}
child1.on('message', onData)
child2.on('message', onData)
// child3.on('message', onData)
// child4.on('message', onData)

const arrs = [child1, child2]

const doRun = (num = 0) => {
  if (num >= names.length) {
    return
  }
  const child = arrs.shift()
  child.send(num)
  arrs.push(child)
  setTimeout(() => {
    doRun(num + 1)
  }, 500)
}

console.time('Test')
doRun()
