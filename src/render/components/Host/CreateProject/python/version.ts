const pythonVersion = {
  FastAPI: {
    url: 'https://fastapi.tiangolo.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        // 推荐使用官方的 fast-api-template
        command:
          'pip install fastapi; npx degit fastapi/full-stack-fastapi-template my-fastapi-app',
        commandWin:
          'pip install fastapi; npx degit fastapi/full-stack-fastapi-template my-fastapi-app'
      }
    ]
  },
  Django: {
    url: 'https://www.djangoproject.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install django; django-admin startproject mysite',
        commandWin: 'pip install django; django-admin startproject mysite'
      }
    ]
  },
  Flask: {
    url: 'https://flask.palletsprojects.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'mkdir my-flask-app; cd my-flask-app; pip install Flask',
        commandWin: 'mkdir my-flask-app; cd my-flask-app; pip install Flask'
      }
    ]
  },
  Streamlit: {
    url: 'https://streamlit.io/',
    list: [
      {
        name: 'latest',
        version: '*',
        command:
          'pip install streamlit; echo "import streamlit as st\nst.write(\'Hello World\')" > app.py; streamlit hello',
        commandWin:
          'pip install streamlit; echo "import streamlit as st`nst.write(\'Hello World\')" > app.py; streamlit hello'
      }
    ]
  },
  Masonite: {
    url: 'https://docs.masoniteproject.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install masonite-cli; craft new project',
        commandWin: 'pip install masonite-cli; craft new project'
      }
    ]
  },
  'uv (Modern Manager)': {
    url: 'https://docs.astral.sh/uv/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'curl -LsSf https://astral.sh/uv/install.sh | sh; uv init',
        commandWin:
          'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"; uv init'
      }
    ]
  },
  'Cookiecutter-Django': {
    url: 'https://github.com/cookiecutter/cookiecutter-django',
    list: [
      {
        name: 'latest',
        version: '*',
        // 使用 cookiecutter 从主流模板创建，这会触发交互式问答界面
        command:
          'pip install cookiecutter; cookiecutter https://github.com/cookiecutter/cookiecutter-django',
        commandWin:
          'pip install cookiecutter; cookiecutter https://github.com/cookiecutter/cookiecutter-django'
      }
    ]
  },
  Wagtail: {
    url: 'https://wagtail.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        // Wagtail 是基于 Django 的高性能内容管理框架，自带交互式脚手架
        command: 'pip install wagtail; wagtail start mysite',
        commandWin: 'pip install wagtail; wagtail start mysite'
      }
    ]
  },
  // --- 以下是新增的框架和工具 ---
  Sanic: {
    url: 'https://sanicframework.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install sanic; sanic myapp',
        commandWin: 'pip install sanic; sanic myapp'
      }
    ]
  },
  'Pynecone (Reflex)': {
    url: 'https://reflex.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install reflex; reflex init',
        commandWin: 'pip install reflex; reflex init'
      }
    ]
  },
  Litestar: {
    url: 'https://litestar.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install litestar; litestar create my-litestar-app',
        commandWin: 'pip install litestar; litestar create my-litestar-app'
      }
    ]
  },
  Mezzanine: {
    url: 'https://github.com/stephenmcd/mezzanine',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install mezzanine; mezzanine-project my-mezzanine-site',
        commandWin: 'pip install mezzanine; mezzanine-project my-mezzanine-site'
      }
    ]
  },
  PDM: {
    url: 'https://pdm.fming.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'pip install pdm; pdm init',
        commandWin: 'pip install pdm; pdm init'
      }
    ]
  }
}

export default pythonVersion
