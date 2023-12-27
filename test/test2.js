const a = () => {
  return new Promise((resolve) => {
    console.log('AAA')
    resolve('a')
  })
}

const b = () => {
  return new Promise((resolve) => {
    console.log('BBB')
    resolve('b')
  })
}

const c = () => {
  return new Promise((resolve) => {
    console.log('CCC')
    resolve('c')
  })
}

const d = () => {
  return new Promise((resolve) => {
    a()
      .then(() => {
        resolve('000')
        return new Promise(() => {})
      })
      .then(() => {
        return c()
      })
      .then(() => {
        console.log('END')
        resolve('111')
      })
      .catch((err) => {
        console.log('err: ', err)
      })
  })
}

d().then((res) => {
  console.log('res: ', res)
})
