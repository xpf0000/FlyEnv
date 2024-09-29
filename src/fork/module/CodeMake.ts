import mysql, { PoolOptions, Pool } from 'mysql2/promise'
import { ForkPromise } from '@shared/ForkPromise'

class CodeMake {
  pool: Pool | undefined

  exec(fnName: keyof CodeMake, ...args: any) {
    const fn: (...args: any) => ForkPromise<any> = this?.[fnName] as any
    return fn.call(this, ...args)
  }

  connent(opt: PoolOptions) {
    return new ForkPromise(async (resolve, reject) => {
      this.pool = mysql.createPool(opt)
      const exclude = ['mysql', 'performance_schema', 'sys', 'information_schema']
      try {
        const res: any = await this.pool.execute('show databases')
        console.log('connent res: ', res)
        const database = res.shift().filter((d: any) => !exclude.includes(d.Database)).map((d: any) => d.Database)
        resolve(database)
      } catch (e) {
        console.log('connent e: ', e)
        reject(e)
      }
    })
  }
}

export default new CodeMake()
