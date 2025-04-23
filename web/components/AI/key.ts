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
    | 'HomebrewPhp7Issues'
    | 'VersionManagerEmpty'
    | 'VersionInstallSlow'
    | 'MacportInstall'
    | 'HomebrewInstall'
    | 'MysqlPassword'
}

export const AIKeys: Array<AIKeyItem> = [
  {
    tips: [
      ['end', 'stop', 'terminate', 'exit'],
      ['task', 'execute']
    ],
    txt: 'Terminate Task',
    task: 'StopTask'
  },
  {
    tips: [
      ['macports', 'port', 'macport', 'version'],
      ['unable', 'how', 'no', 'not'],
      ['use', 'install', 'add']
    ],
    txt: 'MacPorts Installation',
    task: 'MacportInstall'
  },
  {
    tips: [
      ['homebrew', 'brew', 'version'],
      ['unable', 'how', 'no', 'not'],
      ['use', 'install', 'add']
    ],
    txt: 'Homebrew Installation',
    task: 'HomebrewInstall'
  },
  {
    tips: [
      ['new', 'create', 'add', 'generate'],
      ['random', 'test'],
      ['site', 'website']
    ],
    txt: 'Create Random Site',
    task: 'CreateSiteTest'
  },
  {
    tips: [
      ['new', 'create', 'add', 'generate'],
      ['site', 'website']
    ],
    txt: 'Create Site',
    task: 'CreateSite'
  },
  {
    tips: [
      ['site', 'website'],
      ['access', 'browse', 'unable', 'cannot open'],
      ['exception', 'error', 'open']
    ],
    txt: 'Site Access Exception',
    task: 'SiteAccessIssues'
  },
  {
    tips: [['nginx'], ['start', 'service', 'open', 'turn on'], ['exception', 'error', 'failed']],
    txt: 'Nginx Startup Failed',
    task: 'StartNginx'
  },
  {
    tips: [['apache'], ['start', 'service', 'open', 'turn on'], ['exception', 'error', 'failed']],
    txt: 'Apache Startup Failed',
    task: 'StartApache'
  },
  {
    tips: [['mysql'], ['start', 'service', 'open', 'turn on'], ['exception', 'error', 'failed']],
    txt: 'MySQL Startup Failed',
    task: 'StartMysql'
  },
  {
    tips: [['mariadb'], ['start', 'service', 'open', 'turn on'], ['exception', 'error', 'failed']],
    txt: 'MariaDB Startup Failed',
    task: 'StartMariaDB'
  },
  {
    tips: [['memcached'], ['start', 'service', 'open', 'turn on'], ['exception', 'error', 'failed']],
    txt: 'Memcached Startup Failed',
    task: 'StartMemcached'
  },
  {
    tips: [
      ['homebrew', 'brew'],
      ['php7', 'php5'],
      ['no', 'not found', 'not displayed', 'missing']
    ],
    txt: 'Homebrew Missing Low Version PHP',
    task: 'HomebrewPhp7Issues'
  },
  {
    tips: [
      ['version', 'repository', 'version management'],
      ['no', 'not displayed', 'none', 'always', 'always loading', 'no content', 'no data'],
      ['display', 'load', 'content', 'data']
    ],
    txt: 'Version Management Homebrew No Data',
    task: 'VersionManagerEmpty'
  },
  {
    tips: [
      ['version', 'software', 'service'],
      ['install', 'add', 'unable'],
      ['slow', 'stuck', 'install', 'done']
    ],
    txt: 'Version Installation Very Slow',
    task: 'VersionInstallSlow'
  },
  {
    tips: [
      ['mysql', 'mariadb'],
      ['database', 'password', 'manage', 'initial'],
      ['password', 'tool', 'software', 'setup']
    ],
    txt: 'MySQL & MariaDB Initial Password',
    task: 'MysqlPassword'
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
      ['macports', 'port', 'macport'],
      [`can't`, 'how', 'can not', 'not'],
      ['use', 'installed', 'install', 'add']
    ],
    txt: 'MacPorts Installation',
    task: 'MacportInstall'
  },
  {
    tips: [
      ['homebrew', 'brew'],
      [`can't`, 'how', 'can not', 'not'],
      ['use', 'installed', 'install', 'add']
    ],
    txt: 'Homebrew Installation',
    task: 'HomebrewInstall'
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
    txt: 'Nginx startup failed',
    task: 'StartNginx'
  },
  {
    tips: [
      ['apache'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Apache startup failed',
    task: 'StartApache'
  },
  {
    tips: [
      ['mysql'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'MySQL startup failed',
    task: 'StartMysql'
  },
  {
    tips: [
      ['mariadb'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'MariaDB startup failed',
    task: 'StartMariaDB'
  },
  {
    tips: [
      ['memcached'],
      ['start', 'service', 'open', 'turn on'],
      ['exception', 'error', 'failed', 'issues']
    ],
    txt: 'Memcached Startup failed',
    task: 'StartMemcached'
  },
  {
    tips: [
      ['homebrew', 'brew'],
      ['php7', 'php5', 'low'],
      ['not', 'no', 'missing', 'miss'],
      ['available', 'found', 'shown', 'show', 'display']
    ],
    txt: 'Homebrew does not have a low version of PHP',
    task: 'HomebrewPhp7Issues'
  },
  {
    tips: [
      ['version', 'repository', 'manage', 'versioning'],
      ['no', 'not', 'not shown', 'none', 'always', 'always loaded', 'no content', 'no data'],
      ['show', 'display', 'load', 'content', 'data']
    ],
    txt: 'Versioning Homebrew no data',
    task: 'VersionManagerEmpty'
  },
  {
    tips: [
      ['version', 'software', 'service'],
      ['install', 'add', 'unable', 'installation'],
      ['slow', 'stuck', 'install', 'done']
    ],
    txt: 'Version installation is very slow',
    task: 'VersionInstallSlow'
  },
  {
    tips: [
      ['mysql'],
      ['database', 'password', 'manage', 'initial'],
      ['password', 'tool', 'application', 'program', 'software']
    ],
    txt: 'MySQL initial password',
    task: 'MysqlPassword'
  }
]
