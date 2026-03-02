const goVersion = {
  'Go (Standard)': {
    url: 'https://golang.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'go mod init my-module; echo "package main\n\nfunc main() {}" > main.go',
        commandWin:
          'go mod init my-module; "package main`n`nfunc main() {}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  Gin: {
    url: 'https://gin-gonic.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go mod init myapp; go get github.com/gin-gonic/gin; printf "package main\nimport \"github.com/gin-gonic/gin\"\nfunc main() {\n  r := gin.Default()\n  r.GET(\"/ping\", func(c *gin.Context) { c.JSON(200, gin.H{\"message\": \"pong\"}) })\n  r.Run()\n}" > main.go',
        commandWin:
          'go mod init myapp; go get github.com/gin-gonic/gin; "package main`nimport `"github.com/gin-gonic/gin`"`nfunc main() {`n  r := gin.Default()`n  r.GET(`"/ping`签署, func(c *gin.Context) { c.JSON(200, gin.H{`"message`签署: `"pong`签署}) })`n  r.Run()`n}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  Echo: {
    url: 'https://echo.labstack.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go mod init myapp; go get github.com/labstack/echo/v4; printf "package main\nimport (\n\t\"github.com/labstack/echo/v4\"\n\t\"net/http\"\n)\nfunc main() {\n\te := echo.New()\n\te.GET(\"/\", func(c echo.Context) error {\n\t\treturn c.String(http.StatusOK, \"Hello, World!\")\n\t})\n\te.Logger.Fatal(e.Start(\":1323\"))\n}" > main.go',
        commandWin:
          'go mod init myapp; go get github.com/labstack/echo/v4; "package main`nimport (`n`t`"github.com/labstack/echo/v4`"`n`t`"net/http`"`n)`nfunc main() {`n`te := echo.New()`n`te.GET(`"/`签署, func(c echo.Context) error {`n`t`treturn c.String(http.StatusOK, `"Hello, World!`签署)`n`t})`n`te.Logger.Fatal(e.Start(`":1323`签署))`n}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  Fiber: {
    url: 'https://gofiber.io/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go mod init myapp; go get github.com/gofiber/fiber/v2; printf "package main\nimport \"github.com/gofiber/fiber/v2\"\nfunc main() {\n\tapp := fiber.New()\n\tapp.Get(\"/\", func(c *fiber.Ctx) error {\n\t\treturn c.SendString(\"Hello, World!\")\n\t})\n\tapp.Listen(\":3000\")\n}" > main.go',
        commandWin:
          'go mod init myapp; go get github.com/gofiber/fiber/v2; "package main`nimport `"github.com/gofiber/fiber/v2`"`nfunc main() {`n`tapp := fiber.New()`n`tapp.Get(`"/`签署, func(c *fiber.Ctx) error {`n`t`treturn c.SendString(`"Hello, World!`签署)`n`t})`n`tapp.Listen(`":3000`签署)`n}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  Iris: {
    url: 'https://www.iris-go.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go mod init myapp; go get github.com/kataras/iris/v12; printf "package main\nimport \"github.com/kataras/iris/v12\"\nfunc main() {\n\tapp := iris.New()\n\tapp.Get(\"/\", func(ctx iris.Context) {\n\t\tctx.WriteString(\"Hello, World!\")\n\t})\n\tapp.Listen(\":8080\")\n}" > main.go',
        commandWin:
          'go mod init myapp; go get github.com/kataras/iris/v12; "package main`nimport `"github.com/kataras/iris/v12`"`nfunc main() {`n`tapp := iris.New()`n`tapp.Get(`"/`签署, func(ctx iris.Context) {`n`t`tctx.WriteString(`"Hello, World!`签署)`n`t})`n`tapp.Listen(`":8080`签署)`n}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  GoFrame: {
    url: 'https://goframe.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go mod init myapp; go get github.com/gogf/gf/v2; printf "package main\nimport (\n\t\"github.com/gogf/gf/v2/frame/g\"\n\t\"github.com/gogf/gf/v2/net/ghttp\"\n)\nfunc main() {\n\ts := g.Server()\n\ts.BindHandler(\"/\", func(r *ghttp.Request) {\n\t\tr.Response.Write(\"Hello, World!\")\n\t})\n\ts.Run()\n}" > main.go',
        commandWin:
          'go mod init myapp; go get github.com/gogf/gf/v2; "package main`nimport (`n`t`"github.com/gogf/gf/v2/frame/g`"`n`t`"github.com/gogf/gf/v2/net/ghttp`"`n)`nfunc main() {`n`ts := g.Server()`n`ts.BindHandler(`"/`签署, func(r *ghttp.Request) {`n`t`tr.Response.Write(`"Hello, World!`签署)`n`t})`n`ts.Run()`n}" | Out-File -Encoding ascii main.go'
      }
    ]
  },
  'Go-Zero': {
    url: 'https://go-zero.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go install github.com/zeromicro/go-zero/tools/goctl@latest; $(go env GOPATH)/bin/goctl api new demo',
        commandWin:
          '$gopath = go env GOPATH; go install github.com/zeromicro/go-zero/tools/goctl@latest; & "$gopath\\bin\\goctl.exe" api new demo'
      }
    ]
  },
  Buffalo: {
    url: 'https://gobuffalo.io/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go install github.com/gobuffalo/cli/cmd/buffalo@latest; $(go env GOPATH)/bin/buffalo new myapp',
        commandWin:
          '$gopath = go env GOPATH; go install github.com/gobuffalo/cli/cmd/buffalo@latest; & "$gopath\\bin\\buffalo.exe" new myapp'
      }
    ]
  },
  'Hugo (Static)': {
    url: 'https://gohugo.io/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go install github.com/gohugoio/hugo@latest; $(go env GOPATH)/bin/hugo new site my-hugo-site',
        commandWin:
          '$gopath = go env GOPATH; go install github.com/gohugoio/hugo@latest; & "$gopath\\bin\\hugo.exe" new site my-hugo-site'
      }
    ]
  },
  'Cobra (CLI)': {
    url: 'https://github.com/spf13/cobra',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'go install github.com/spf13/cobra-cli@latest; go mod init myapp; $(go env GOPATH)/bin/cobra-cli init',
        commandWin:
          '$gopath = go env GOPATH; go install github.com/spf13/cobra-cli@latest; go mod init myapp; & "$gopath\\bin\\cobra-cli.exe" init'
      }
    ]
  }
}

export default goVersion
