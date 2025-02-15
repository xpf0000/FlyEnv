# Run Laravel Use FlyEnv

## Creating a Laravel Project

If you want to use an existing project. You can skip this step. See <a href="#create-site">Create Site</a>

You can create a [Laravel](https://laravel.com/) project using [Composer](https://getcomposer.org/)

```shell
composer create-project laravel/laravel example-app
```

Of course, FlyEnv also provides a way to quickly create laravel projects.

1. In the Hosts panel. Click 'New Project'

<img src="https://oss.macphpstudy.com/image/F74AA939C46A.png" data-x-image-preview="">

2. Choose project save path, project used PHP version, and Laravel version. Click 'OK' button.

<img src="https://oss.macphpstudy.com/image/8E783623E2F8.png" data-x-image-preview="">

3. After the project is created, you can proceed to the next step. Create a site

<img src="https://oss.macphpstudy.com/image/BAAB108613E2.png" data-x-image-preview="">

## Create Site

Click the 'Add' button in the Hosts panel. Or click 'Create Host' button on pre step. Enter the add site interface

Field descriptions can be found in this reference [Hosts](/guide/host)

1. Select site root directory. For Laravel projects, select the public directory. If it comes in from the previous step, it will be automatically selected.

<img src="https://oss.macphpstudy.com/image/E53248FED5BC.png" data-x-image-preview="">

2. Set url rewrite

- Nginx

Select laravel in the 'Nginx Url Rewrite' block. If it comes from the previous step, it will be automatically selected.

<img src="https://oss.macphpstudy.com/image/AF72C71F6596.png" data-x-image-preview="">

Or use this

```sh
location / {
	try_files $uri $uri/ /index.php$is_args$query_string;
}
```

- Apache

When the project is created, the .htaccess file has been automatically created. Or use this to create it manually

```sh
<IfModule mod_rewrite.c>
    <IfModule mod_negotiation.c>
        Options -MultiViews -Indexes
    </IfModule>

    RewriteEngine On

    # Handle Authorization Header
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    # Redirect Trailing Slashes If Not A Folder...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} (.+)/$
    RewriteRule ^ %1 [L,R=301]

    # Send Requests To Front Controller...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^ index.php [L]
</IfModule>
```

- Caddy

No additional setup required

## Up and Running

- Start PHP / Apache / Nginx / Caddy. Click the link in the Hosts panel. Open in browser

<img src="https://oss.macphpstudy.com/image/4373D117408E.png" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/4FCCC65341EC.png" data-x-image-preview="">

- View site log here

<img src="https://oss.macphpstudy.com/image/14C9AD3814FA.png" data-x-image-preview="">
<p/>
<img src="https://oss.macphpstudy.com/image/D999E4BFEF0B.png" data-x-image-preview="">



