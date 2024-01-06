export interface AIKeyItem {
  tips: Array<Array<string>>
  txt: string
  task: 'CreateSiteTest' | 'StopTask' | 'CreateSite'
}

export const AIKeys: Array<AIKeyItem> = [
  {
    tips: [['结束', '停止', '终止'], ['任务']],
    txt: '终止任务',
    task: 'StopTask'
  },
  {
    tips: [
      ['新建', '创建', '新增', '添加', '生成'],
      ['随机', '测试'],
      ['站点', '网站']
    ],
    txt: '创建随机站点',
    task: 'CreateSiteTest'
  },
  {
    tips: [
      ['新建', '创建', '新增', '添加', '生成'],
      ['站点', '网站']
    ],
    txt: '创建站点',
    task: 'CreateSite'
  },
  {
    tips: [
      ['站点', '网站'],
      ['访问', '浏览', '无法', '打不开'],
      ['异常', '报错', '打开']
    ],
    txt: '站点访问异常',
    task: 'CreateSiteTest'
  },
  {
    tips: [['nginx'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'nginx启动失败',
    task: 'CreateSiteTest'
  },
  {
    tips: [['apache'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'apache启动失败',
    task: 'CreateSiteTest'
  },
  {
    tips: [['mysql'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'mysql启动失败',
    task: 'CreateSiteTest'
  },
  {
    tips: [['mariadb'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'mariadb启动失败',
    task: 'CreateSiteTest'
  },
  {
    tips: [['redis'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'redis启动失败',
    task: 'CreateSiteTest'
  }
]
