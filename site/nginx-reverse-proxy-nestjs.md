# Nginx Reverse Proxy NestJS/NodeJS

![nest-big-logo.png](https://oss.macphpstudy.com/image/nest-big-logo.png)

Using [NestJS](https://nestjs.com/). It is easy to build a server-side application. But it's a bit troublesome to deploy. Because the files packaged by NestJS. There is no index.php/index.html file like in PHP projects or static HTML projects

To run NestJS applications behind Nginx, you need to ensure that the NestJS application is listening on a port, and then configure Nginx as a reverse proxy. Here is a basic Nginx configuration example that proxies traffic to NestJS applications running on port 3000:

1. Firstly, make sure that your NestJS application is listening on a port, such as 3000.

2. Add reverse proxy configuration in the server block of site Nginx VHost configuration file

```sh
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;
}
```

<img src="https://oss.macphpstudy.com/image/6800bed68acd.gif" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/538a79e9e3c9.gif" data-x-image-preview="">

3. Restart Nginx or reload Nginx configuration

Now, when you access your server through a website domain, all requests will be forwarded by Nginx to the NestJS application running on port 3000.
