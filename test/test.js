const axios = require('axios')

const urls = [
    'https://www.enterprisedb.com/downloads/postgres-postgresql-downloads',
    // 'https://downloads.mysql.com/archives/community/'
]

const fetchVersions = (url) => {
    const all = []
    return new Promise((resolve) => {
        axios({
            url,
            method: 'get'
        }).then((res) => {
            const html = res.data
            // console.log(html)
            const reg = /<tbody((?!<\/table>)[\s\S]*?)<\/tbody>/g
            let r
            while ((r = reg.exec(html)) !== null) {
                let table = r[0]
                table = table.replace(/<svg((?!<\/svg>)[\s\S]*?)<\/svg>/g, '')
                    .replace(/[\n]+/g, '')
                    .replace(/[\s]+/g, ' ')
                    .replace(/<\!--(.*?)-->/g, ' ')
                console.log(table)

                const reg1 = /<tr(.*?)<td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)<\/td><td(.*?)>(.*?)href="(.*?)"(.*?)<\/td><td(.*?)>(.*?)<\/td><\/tr>/g
                let r1
                while ((r1 = reg1.exec(table)) !== null) {
                    console.log(r1)
                    const u = new URL(r1[12], url).toString()
                    const version = r1[3]
                    const mv = version.split('.').slice(0, 2).join('.')
                    const item = {
                        url: u,
                        version,
                        mVersion: mv
                    }
                    if (!all.find((f) => f.version === item.version)) {
                        all.push(item)
                    }
                }

            }
            resolve(all)
        })
    })
}

const all = []
Promise.all(urls.map((u) => fetchVersions(u))).then((res) => {
    const list = res.flat()
    list.forEach((l) => {
        // if (!all.find((f) => f.mVersion === l.mVersion)) {
        all.push(l)
        // }
    })
    console.log('all: ', all)
})