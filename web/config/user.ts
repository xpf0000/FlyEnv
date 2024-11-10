export const User = {
  server: {
    tomcat: {
      current: {
        version: '10.1.31',
        bin: '/opt/homebrew/Cellar/tomcat/10.1.31/libexec/bin/startup.sh',
        path: '/opt/homebrew/Cellar/tomcat/10.1.31/libexec/',
        num: 101,
        enable: true,
        run: true,
        running: false
      }
    },
    caddy: {
      current: {
        version: '2.8.4',
        bin: '/usr/local/Cellar/caddy/2.8.4/bin/caddy',
        path: '/usr/local/Cellar/caddy/2.8.4/',
        num: 28,
        enable: true,
        run: true,
        running: false
      }
    },
    postgresql: {
      current: {
        version: '17.0',
        bin: '/usr/local/Cellar/postgresql@17/17.0/bin/pg_ctl',
        path: '/usr/local/Cellar/postgresql@17/17.0',
        num: 170,
        enable: true,
        run: false,
        running: false
      }
    },
    nginx: {
      current: {
        version: '1.27.2',
        bin: '/usr/local/Cellar/nginx/1.27.2/bin/nginx',
        path: '/usr/local/Cellar/nginx/1.27.2/',
        num: 125,
        enable: true,
        run: false,
        running: false
      }
    },
    php: {
      current: {
        version: '8.1.10',
        bin: '/usr/local/Cellar/php/8.1.10_1/sbin/php-fpm',
        path: '/usr/local/Cellar/php/8.1.10_1/'
      }
    },
    mysql: {
      current: {
        version: '5.7.29',
        bin: '/usr/local/Cellar/mysql@5.7.29/5.7.29/bin/mysqld_safe',
        path: '/usr/local/Cellar/mysql@5.7.29/5.7.29/',
        num: 57,
        enable: true,
        run: false,
        running: false
      }
    },
    apache: {
      current: {
        version: '2.4.57',
        bin: '/opt/local/sbin/apachectl',
        path: '/opt/local/',
        num: 24,
        enable: true,
        run: false,
        running: false
      }
    },
    memcached: {
      current: {
        version: '1.5.22',
        bin: '/opt/local/bin/memcached',
        path: '/opt/local/',
        num: 15,
        enable: true,
        run: false,
        running: false
      }
    },
    redis: {
      current: {
        version: '7.2.6',
        bin: '/usr/local/Cellar/redis/7.2.6/bin/redis-server',
        path: '/usr/local/Cellar/redis/7.2.6/',
        num: 72,
        enable: true,
        run: false,
        running: false
      }
    },
    rabbitmq: {
      current: {
        version: '4.0.2',
        bin: '/opt/homebrew/Cellar/rabbitmq/4.0.2/sbin/rabbitmq-server',
        path: '/opt/homebrew/Cellar/rabbitmq/4.0.2/',
        num: 40,
        enable: true,
        run: false,
        running: false
      }
    },
    mongodb: {
      current: {
        version: '7.0.2',
        bin: '/usr/local/Cellar/mongodb-community/7.0.2/bin/mongod',
        path: '/usr/local/Cellar/mongodb-community/7.0.2/',
        num: 70,
        enable: true,
        run: false,
        running: false
      }
    },
    mariadb: {
      current: {
        version: '10.11.1',
        bin: '/opt/local/lib/mariadb-10.11/bin/mariadbd-safe',
        path: '/opt/local/lib/mariadb-10.11',
        num: 1011,
        enable: true,
        run: false,
        running: false,
        flag: 'port'
      }
    },
    'pure-ftpd': {
      current: {
        version: '1.0',
        bin: '/usr/local/Cellar/pure-ftpd/1.0.51_2/sbin/pure-ftpd',
        path: '/usr/local/Cellar/pure-ftpd/1.0.51_2/',
        num: 10,
        enable: true,
        run: false,
        running: false
      }
    }
  },
  setup: {
    currentNodeTool: 'fnm',
    lang: navigator.language === 'zh-CN' ? 'zh' : 'en',
    common: {
      showItem: {
        Hosts: true,
        Nginx: true,
        Caddy: true,
        Apache: true,
        Mysql: true,
        Php: true,
        Memcached: true,
        Redis: true,
        NodeJS: true,
        Tools: true,
        HttpServe: true,
        MongoDB: true,
        mariadb: true,
        DNS: true,
        FTP: true,
        PostgreSql: true,
        java: true,
        tomcat: true
      }
    },
    postgresql: {
      dirs: []
    },
    caddy: {
      dirs: []
    },
    nginx: {
      dirs: []
    },
    apache: {
      dirs: []
    },
    mysql: {
      dirs: []
    },
    php: {
      dirs: []
    },
    memcached: {
      dirs: []
    },
    redis: {
      dirs: []
    },
    hosts: {
      write: true
    },
    proxy: {
      on: false,
      fastProxy: '127.0.0.1:1087',
      proxy:
        'export https_proxy=http://127.0.0.1:1087 http_proxy=http://127.0.0.1:1087 all_proxy=socks5://127.0.0.1:1087 HTTPS_PROXY=http://127.0.0.1:1087 HTTP_PROXY=http://127.0.0.1:1087 ALL_PROXY=socks5://127.0.0.1:1087'
    },
    mongodb: {
      dirs: []
    },
    mariadb: {
      dirs: []
    },
    autoCheck: true,
    theme: 'system',
    editorConfig: {
      theme: 'auto',
      fontSize: 16,
      lineHeight: 2
    },
    phpGroupStart: {}
  },
  tools: {
    siteSucker: {
      commonSetup: {
        dir: '',
        proxy: '',
        excludeLink: '',
        pageLimit: ''
      }
    }
  },
  httpServe: ['/Users/XXX/Desktop/Web/xxxxA', '/Users/XXX/Desktop/Web/xxxxB']
}
