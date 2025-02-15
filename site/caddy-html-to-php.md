# Caddy parse .html file to php

If your html file has php include. And you dont want to change the file type to php. Just want to make Caddy to treat html file as php file. you can follow this

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

3. Add this to site's Caddy vhost file. you should change 'phpwebstudy-php-cgi-83.sock' to you choosed php version

```sh
@phpFiles path *.php *.html
reverse_proxy @phpFiles unix//tmp/phpwebstudy-php-cgi-83.sock {
	transport fastcgi {
		split .php .html
	}
}
```

<img src="https://oss.macphpstudy.com/image/6D9984390BA5.png" data-x-image-preview="">

4. Start Caddy and PHP. Open the website in the browser and view the results


