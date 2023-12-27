import { ForkPromise } from './ForkPromise'
const a = () => {
  return new ForkPromise((resolve, reject, on) => {
    on(0)
    setTimeout(() => {
      on(1)
      resolve(true)
    }, 500)
  })
}

const b = () => {
  return new ForkPromise(async (resolve, reject, on) => {
    await a().on(on)
    resolve(555)
  })
}

b()
  .on((data) => {
    console.log('on: ', data)
  })
  .then((res) => {
    console.log(res)
  })
