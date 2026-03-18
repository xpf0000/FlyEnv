# Node.JS模块， fnm和nvm重构

目前nodejs模块里， fnm和nvm的支持并不好， 比如fnm和nvm的是否安装检测， 安装， node版本安装等， 都有问题。
想要修改成使用 NodePTY+XTerm 的方式。

当前fnm和nvm相关文件：
@src/render/components/Nodejs/fnm
@src/render/components/Nodejs/nvm
@src/fork/module/Node
@src/fork/module/Node.win

修改参照文件：
@src/fork/module/OpenClaw/index.ts
@src/render/components/OpenClaw/Service.vue
@src/render/components/OpenClaw/setup.ts
