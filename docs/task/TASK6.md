目前按照docs/design/712-ai-coding-cli-integration.md实现了 AI Code模块, 并已经集成了Claude Code. 但是感觉效果不好.
1. 移除所有AI Code模块和Claude Code相关的代码.
2. 参照Hermes模块来集成Kimi.  tab有以下几个:
  - 服务. 显示版本,快捷命令等信息. 没有安装显示安装. 点击使用官方命令安装.
  - 配置文件. 显示主要的配置文件. 看下是否有配置项可以配置成快捷设置.
  - 日志. 显示主要的日志文件
  - Session. 显示所有的session. 以及可用的操作.
