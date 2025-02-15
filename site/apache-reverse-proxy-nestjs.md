# Apache Reverse Proxy NestJS/NodeJS

![nest-big-logo.png](https://oss.macphpstudy.com/image/nest-big-logo.png)

Using [NestJS](https://nestjs.com/). It is easy to build a server-side application. But it's a bit troublesome to deploy. Because the files packaged by NestJS. There is no index.php/index.html file like in PHP projects or static HTML projects

To run NestJS applications behind Apache, you need to ensure that the NestJS application is listening on a port, and then configure Apache as a reverse proxy. Here is a basic Apache configuration example that proxies traffic to NestJS applications running on port 3000:

1. Firstly, make sure that your NestJS application is listening on a port, such as 3000.

2. In the Apache configuration file. Enable proxy_module and proxy_http_module

<img src="https://oss.macphpstudy.com/image/31e3ed1416f3.gif" data-x-image-preview="">

3. Add reverse proxy configuration in site Apache VHost configuration file

```sh
<VirtualHost *:80>
  ...
  ProxyPassMatch ^/.*$ http://localhost:3000
  ProxyPassReverse ^/.*$ http://localhost:3000
  ...
</VirtualHost>
<VirtualHost *:443>
  ...
  ProxyPassMatch ^/.*$ http://localhost:3000
  ProxyPassReverse ^/.*$ http://localhost:3000
  ...
</VirtualHost>
```

<img src="https://oss.macphpstudy.com/image/d94dc77941ca.gif" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/3bfafba6d896.gif" data-x-image-preview="">

4. Restart Apache or reload Apache configuration

Now, when you access your server through a website domain, all requests will be forwarded by Apache to the NestJS application running on port 3000.
