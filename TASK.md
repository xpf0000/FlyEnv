# Node.JS模块， fnm和nvm问题处理

1. @src/render/components/Nodejs/fnm/setup.ts. fnm安装方法, 缺少Windows支持.
2. @src/render/components/Nodejs/nvm/setup.ts. nvm安装方法, 缺少Windows支持.
3. 查看 IPC.send('app-fork:node' 用到的方法. 然后移除@src/fork/module/Node/index.ts和@src/fork/module/Node.win/index.ts里没用到的方法.
