export const Tomcat = {
  homebrew: {
    tomcat: {
      version: '10.1.28',
      installed: true,
      name: 'tomcat',
      flag: 'brew'
    },
    'tomcat@9': {
      version: '9.0.93',
      installed: true,
      name: 'tomcat@9',
      flag: 'brew'
    },
    'tomcat@8': {
      version: '8.5.100',
      installed: true,
      name: 'tomcat@8',
      flag: 'brew'
    }
  },
  macports: {},
  static: {
    'tomcat-10.1.28': {
      url: 'https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.28/bin/apache-tomcat-10.1.28.tar.gz',
      version: '10.1.28',
      mVersion: '10.1',
      appDir: '/Users/x/Library/PhpWebStudy/app/static-tomcat-10.1.28',
      zip: '/Users/x/Library/PhpWebStudy/server/cache/static-tomcat-10.1.28.tar.gz',
      bin: '/Users/x/Library/PhpWebStudy/app/static-tomcat-10.1.28/bin/catalina.sh',
      downloaded: false,
      installed: false
    },
    'tomcat-11.0.0-M24': {
      url: 'https://dlcdn.apache.org/tomcat/tomcat-11/v11.0.0-M24/bin/apache-tomcat-11.0.0-M24.tar.gz',
      version: '11.0.0-M24',
      mVersion: '11.0',
      appDir: '/Users/x/Library/PhpWebStudy/app/static-tomcat-11.0.0-M24',
      zip: '/Users/x/Library/PhpWebStudy/server/cache/static-tomcat-11.0.0-M24.tar.gz',
      bin: '/Users/x/Library/PhpWebStudy/app/static-tomcat-11.0.0-M24/bin/catalina.sh',
      downloaded: false,
      installed: false
    },
    'tomcat-9.0.93': {
      url: 'https://dlcdn.apache.org/tomcat/tomcat-9/v9.0.93/bin/apache-tomcat-9.0.93.tar.gz',
      version: '9.0.93',
      mVersion: '9.0',
      appDir: '/Users/x/Library/PhpWebStudy/app/static-tomcat-9.0.93',
      zip: '/Users/x/Library/PhpWebStudy/server/cache/static-tomcat-9.0.93.tar.gz',
      bin: '/Users/x/Library/PhpWebStudy/app/static-tomcat-9.0.93/bin/catalina.sh',
      downloaded: false,
      installed: false
    }
  }
}
