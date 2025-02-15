# Caddy Reverse Proxy NestJS/NodeJS

![nest-big-logo.png](https://oss.macphpstudy.com/image/nest-big-logo.png)

Using [NestJS](https://nestjs.com/). It is easy to build a server-side application. But it's a bit troublesome to deploy. Because the files packaged by NestJS. There is no index.php/index.html file like in PHP projects or static HTML projects

To run NestJS applications behind Caddy, you need to ensure that the NestJS application is listening on a port, and then configure Caddy as a reverse proxy. Here is a basic Caddy configuration example that proxies traffic to NestJS applications running on port 3000:

1. Firstly, make sure that your NestJS application is listening on a port, such as 3000.

2. Add reverse proxy configuration in site Caddy VHost configuration file

```sh
http://www.nesttest.com {
  ...
  reverse_proxy localhost:3000
  ...
}
https://www.nesttest.com {
  ...
  reverse_proxy localhost:3000
  ...
}
```

<img src="https://oss.macphpstudy.com/image/ad4ed5e4d920.gif" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/7d471c604f09.gif" data-x-image-preview="">

3. Restart Caddy or reload Caddy configuration

Now, when you access your server through a website domain, all requests will be forwarded by Caddy to the NestJS application running on port 3000.
