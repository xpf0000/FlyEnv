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
      ['结束', '停止', '终止', '退出'],
      ['任务', '执行']
    ],
    txt: '终止任务',
    task: 'StopTask'
  },
  {
    tips: [
      ['macports', 'port', 'macport', '版本'],
      ['无法', '怎么', '没有', '没'],
      ['使用', '安装', '添加']
    ],
    txt: 'MacPorts安装',
    task: 'MacportInstall'
  },
  {
    tips: [
      ['homebrew', 'brew', '版本'],
      ['无法', '怎么', '没有', '没'],
      ['使用', '安装', '添加']
    ],
    txt: 'Homebrew安装',
    task: 'HomebrewInstall'
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
  },
  {
    tips: [
      ['homebrew', 'brew'],
      ['php7', 'php5'],
      ['没有', '找不到', '不显示', '缺失']
    ],
    txt: 'Homebrew没有低版本PHP',
    task: 'HomebrewPhp7Issues'
  },
  {
    tips: [
      ['版本', '版本库', '版本管理'],
      ['不', '不显示', '无', '一直', '一直加载', '无内容', '无数据'],
      ['显示', '加载', '内容', '数据']
    ],
    txt: '版本管理Homebrew无数据',
    task: 'VersionManagerEmpty'
  },
  {
    tips: [
      ['版本', '软件', '服务'],
      ['安装', '添加', '新增', '无法'],
      ['慢', '卡', '安装', '完成']
    ],
    txt: '版本安装非常慢',
    task: 'VersionInstallSlow'
  },
  {
    tips: [
      ['mysql', 'maraidb'],
      ['数据库', '密码', '管理', '初始'],
      ['密码', '工具', '软件', '设置']
    ],
    txt: 'Mysql&MariaDB初始密码',
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
    txt: 'Mysql initial password',
    task: 'MysqlPassword'
  }
]
export const AIKeysVI: Array<AIKeyItem> = [
  {
    tips: [
      ['kết thúc', 'dừng', 'chấm dứt', 'thoát'],
      ['tác vụ', 'nhiệm vụ']
    ],
    txt: 'Hủy tác vụ',
    task: 'StopTask'
  },
  {
    tips: [
      ['macports', 'port', 'macport', 'phiên bản'],
      ['không thể', 'làm sao', 'không có', 'không'],
      ['sử dụng', 'cài đặt', 'thêm']
    ],
    txt: 'Cài đặt MacPorts',
    task: 'MacportInstall'
  },
  {
    tips: [
      ['homebrew', 'brew', 'phiên bản'],
      ['không thể', 'làm sao', 'không có', 'không'],
      ['sử dụng', 'cài đặt', 'thêm']
    ],
    txt: 'Cài đặt Homebrew',
    task: 'HomebrewInstall'
  },
  {
    tips: [
      ['mới', 'tạo', 'thêm', 'sinh'],
      ['ngẫu nhiên', 'thử nghiệm'],
      ['trang web', 'trang']
    ],
    txt: 'Tạo trang web ngẫu nhiên',
    task: 'CreateSiteTest'
  },
  {
    tips: [
      ['mới', 'tạo', 'thêm', 'sinh'],
      ['trang web', 'trang']
    ],
    txt: 'Tạo trang web',
    task: 'CreateSite'
  },
  {
    tips: [
      ['trang web', 'trang'],
      ['truy cập', 'duyệt', 'không thể', 'không mở được'],
      ['bất thường', 'báo lỗi', 'mở']
    ],
    txt: 'Lỗi truy cập trang web',
    task: 'SiteAccessIssues'
  },
  {
    tips: [['nginx'], ['khởi động', 'dịch vụ', 'mở', 'bật'], ['bất thường', 'báo lỗi', 'thất bại']],
    txt: 'Nginx khởi động thất bại',
    task: 'StartNginx'
  },
  {
    tips: [['apache'], ['khởi động', 'dịch vụ', 'mở', 'bật'], ['bất thường', 'báo lỗi', 'thất bại']],
    txt: 'Apache khởi động thất bại',
    task: 'StartApache'
  },
  {
    tips: [['mysql'], ['khởi động', 'dịch vụ', 'mở', 'bật'], ['bất thường', 'báo lỗi', 'thất bại']],
    txt: 'Mysql khởi động thất bại',
    task: 'StartMysql'
  },
  {
    tips: [['mariadb'], ['khởi động', 'dịch vụ', 'mở', 'bật'], ['bất thường', 'báo lỗi', 'thất bại']],
    txt: 'Mariadb khởi động thất bại',
    task: 'StartMariaDB'
  },
  {
    tips: [['memcached'], ['khởi động', 'dịch vụ', 'mở', 'bật'], ['bất thường', 'báo lỗi', 'thất bại']],
    txt: 'Memcached khởi động thất bại',
    task: 'StartMemcached'
  },
  {
    tips: [
      ['homebrew', 'brew'],
      ['php7', 'php5', 'thấp'],
      ['không', 'không có', 'thiếu'],
      ['khả dụng', 'tìm thấy', 'hiển thị']
    ],
    txt: 'Homebrew không có PHP phiên bản thấp',
    task: 'HomebrewPhp7Issues'
  },
  {
    tips: [
      ['phiên bản', 'kho lưu trữ', 'quản lý', 'phiên bản hóa'],
      ['không', 'không hiển thị', 'trống', 'luôn', 'luôn tải', 'không có nội dung', 'không có dữ liệu'],
      ['hiển thị', 'tải', 'nội dung', 'dữ liệu']
    ],
    txt: 'Quản lý phiên bản Homebrew không có dữ liệu',
    task: 'VersionManagerEmpty'
  },
  {
    tips: [
      ['phiên bản', 'phần mềm', 'dịch vụ'],
      ['cài đặt', 'thêm', 'không thể', 'cài'],
      ['chậm', 'treo', 'cài đặt', 'xong']
    ],
    txt: 'Cài đặt phiên bản rất chậm',
    task: 'VersionInstallSlow'
  },
  {
    tips: [
      ['mysql', 'maraidb'],
      ['cơ sở dữ liệu', 'mật khẩu', 'quản lý', 'ban đầu'],
      ['mật khẩu', 'công cụ', 'phần mềm']
    ],
    txt: 'Mật khẩu ban đầu của Mysql&MariaDB',
    task: 'MysqlPassword'
  }
]
