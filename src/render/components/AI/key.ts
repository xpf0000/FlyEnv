export interface AIKeyItem {
  tips: Array<Array<string>>
  txt: string
  task:
    | 'CreateSiteTest'
    | 'StopTask'
    | 'CreateSite'
    | 'SiteAccessIssues'
    | 'StartNginx'
    | 'StartApache'
    | 'StartMysql'
    | 'StartMariaDB'
    | 'StartMemcached'
}

export const AIKeys: Array<AIKeyItem> = [
  {
    tips: [
      ['结束', '停止', '终止', '退出'],
      ['任务', '执行']
    ],
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
    task: 'SiteAccessIssues'
  },
  {
    tips: [['nginx'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'nginx启动失败',
    task: 'StartNginx'
  },
  {
    tips: [['apache'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'apache启动失败',
    task: 'StartApache'
  },
  {
    tips: [['mysql'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'mysql启动失败',
    task: 'StartMysql'
  },
  {
    tips: [['mariadb'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'mariadb启动失败',
    task: 'StartMariaDB'
  },
  {
    tips: [['memcached'], ['启动', '服务', '开启', '打开'], ['异常', '报错', '失败']],
    txt: 'memcached启动失败',
    task: 'StartMemcached'
  }
]
export const AIKeysEN: Array<AIKeyItem> = [
  {
    tips: [
      ['end', 'stop', 'terminate', 'quit', 'exit', 'esc', 'abort'],
      ['task', 'missions', 'mandate', 'assignment']
    ],
    txt: 'Abort Task',
    task: 'StopTask'
  },
  {
    tips: [
      ['new', 'create', 'add', 'generate'],
      ['random', 'test'],
      ['site', 'sites', 'host', 'website']
    ],
    txt: 'Creating a Random Site',
    task: 'CreateSiteTest'
  },
  {
    tips: [
      ['new', 'create', 'add', 'generate'],
      ['site', 'sites', 'host', 'website']
    ],
    txt: 'Creating a Site',
    task: 'CreateSite'
  },
  {
    tips: [
      ['site', 'sites', 'host', 'website'],
      ['access', 'browse', 'unable', 'cannot open'],
      ['exception', 'error', 'open', 'issues']
    ],
    txt: 'Site Access Exceptions',
    task: 'SiteAccessIssues'
  },
  {
    tips: [
      ['nginx'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Nginx Startup Failed',
    task: 'StartNginx'
  },
  {
    tips: [
      ['apache'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Apache Startup Failed',
    task: 'StartApache'
  },
  {
    tips: [
      ['mysql'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Mysql Startup Failed',
    task: 'StartMysql'
  },
  {
    tips: [
      ['mariadb'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Mariadb Startup Failed',
    task: 'StartMariaDB'
  },
  {
    tips: [
      ['memcached'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Memcached Startup Failed',
    task: 'StartMemcached'
  }
]
