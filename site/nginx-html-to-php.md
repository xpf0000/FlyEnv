# Nginx parse .html file to php

If your html file has php include. And you dont want to change the file type to php. Just want to make Nginx to treat html file as php file. you can follow this

1. Create index.html file

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="renderer" content="webkit">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body>
<?php echo "This is PHP Code"; ?>
</body>
</html>
```

2. Create a test site use FlyEnv. Choose a php version. like php8.3. Add this to php-fpm.conf  \[www\] block.

```sh
security.limit_extensions = .php .php3 .php4 .php5 .php7 .html .htm
```

<img src="https://oss.macphpstudy.com/image/07F1DB6F7926.png" data-x-image-preview="">

3. Add this to site's Nginx vhost file. you should change 'phpwebstudy-php-cgi-83.sock' to you choosed php version

```sh
location ~ [^/]\.html(/|$)
{
	try_files $uri =404;
    fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-83.sock;
    fastcgi_index index.php;
    include fastcgi.conf;
	include pathinfo.conf;
}
```

<img src="https://oss.macphpstudy.com/image/0177C26B65E1.png" data-x-image-preview="">

4. Start Nginx and PHP. Open the website in the browser and view the results


