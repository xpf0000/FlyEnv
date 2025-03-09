export default {
  选择站点目录: 'Chọn thư mục trang web',
  选择文件夹: 'Chọn thư mục',

  错误类型: 'Loại lỗi',
  type403: `Lỗi 403 thường cho thấy thiếu quyền truy cập, có thể kiểm tra theo các cách sau:
  1. Thư mục có thuộc về người dùng hiện tại hoặc root không, nếu không, nên thay đổi thư mục.
  2. Quyền thực thi thư mục, có phải là 755 hoặc 777 không. Phần mềm sẽ mặc định cập nhật quyền thư mục thành 755 khi thêm trang web, nhưng nếu thư mục nằm trong một số thư mục hệ thống, bạn có thể không thay đổi được, nên thay đổi thư mục.
  3. Người dùng khởi động dịch vụ, ví dụ như người dùng khởi động nginx, người dùng khởi động apache, cấu hình mặc định của phần mềm về lý thuyết là đúng và khả dụng, nếu bạn sửa đổi tệp cấu hình, bạn có thể thử lại bằng cấu hình mặc định.`,
  type404: `Lỗi 404 thường cho biết không tìm thấy tệp trang tương ứng, bạn có thể kiểm tra từ các khía cạnh sau:
  1. Thư mục trang web có chứa tệp trang tương ứng không, nếu là thư mục gốc, có index.php hoặc index.html không.
  2. Tệp cấu hình nginx hoặc apache, có sửa đổi tài liệu mặc định không.
  3. Một số dự án cần cấu hình rewrite (pseudo-static), ví dụ như ThinkPHP, Laravel, v.v. Tệp rewrite của apache, dự án thường chứa tệp rewrite, sử dụng nginx, bạn cần thêm khi thêm trang web.`,
  type502: `Lỗi 50X thường xác định lỗi thực thi dự án hoặc hết thời gian thực thi, nhưng việc sử dụng truy cập tên miền, sử dụng VPN toàn cầu, cũng sẽ báo lỗi 502, nên tắt VPN toàn cầu và thử lại!`,

  任务已终止: 'Tác vụ đã bị hủy bỏ',
  当前有任务正在执行: 'Hiện có một tác vụ đang thực hiện, vui lòng đợi tác vụ hoàn tất.',
  尚不能执行此任务:
    'Tác vụ này chưa thể thực hiện, vui lòng chọn từ các tác vụ hiện có.',

  未发现可用版本: 'Không tìm thấy phiên bản khả dụng, vui lòng cài đặt trước',
  Apache服务启动成功: 'Dịch vụ Apache đã khởi động thành công',
  服务启动失败端口占用: `Khởi động dịch vụ thất bại với lý do lỗi:
{err}
Lý do lỗi được nhận dạng: Xung đột cổng, hãy thử kết thúc tiến trình chiếm cổng`,

  成功创建站点: 'Tạo trang web thành công',
  站点域名: 'Tên miền trang web',
  站点目录: 'Thư mục trang web',
  尝试开启服务: 'Đang thử khởi động dịch vụ, vui lòng đợi...',
  服务启动成功: 'Dịch vụ đã khởi động thành công',
  域名: 'Tên miền',
  已在浏览器中打开: 'Đã mở trong trình duyệt của bạn, vui lòng kiểm tra',
  服务启动失败: `Khởi động dịch vụ thất bại, nguyên nhân.
{err}
Vui lòng thử khởi động dịch vụ thủ công`,

  MariaDB服务启动成功: 'Dịch vụ MariaDB đã khởi động thành công',
  Memcached服务启动成功: 'Dịch vụ Memcached đã khởi động thành công',
  Mysql服务启动成功: 'Dịch vụ Mysql đã khởi động thành công',
  Nginx服务启动成功: 'Dịch vụ Nginx đã khởi động thành công',
  Php服务启动成功: 'Dịch vụ Php{num} đã khởi động thành công',

  尝试启动Apache服务: 'Thử khởi động dịch vụ Apache...',

  请输入或选择站点目录: 'Vui lòng nhập hoặc chọn thư mục trang web',
  站点目录无效: 'Thư mục trang web không hợp lệ, tác vụ bị hủy bỏ',
  请输入站点域名: 'Vui lòng nhập tên miền của trang web, ví dụ: www.test.com',
  域名无效: 'Tên miền không hợp lệ, tác vụ bị hủy bỏ',
  创建站点中: 'Đang tạo trang web...',

  请查看日志: 'Vui lòng kiểm tra nhật ký {flag} và gửi cho tôi thông báo lỗi.',
  识别到端口占用:
    'Lý do lỗi được nhận dạng: Xung đột cổng, hãy thử kết thúc tiến trình chiếm cổng',
  未识别到错误原因:
    'Chưa xác định được nguyên nhân lỗi, hiện tại không thể xử lý, chờ cập nhật',
  识别到Socket占用:
    'Lý do lỗi được nhận dạng: Xung đột tệp Socket, hãy thử kết thúc tiến trình chiếm tệp socket.',
  尝试启动Nginx服务: 'Thử khởi động dịch vụ Nginx...',
  站点错误码是否以下几种: 'Mã lỗi trang web có phải là một trong các loại sau không?',
  任务执行失败: `Thực hiện tác vụ thất bại do:
 {err}`,

  我是pipi: `Xin chào, tôi là pipi. Tôi có thể giúp gì cho bạn?`,
  你的要求: 'Bạn có thể trực tiếp nhập yêu cầu của mình, chẳng hạn như tạo một trang web mới',

  brewPhp7Issues: `Kho lưu trữ PHP chính thức của Homebrew sẽ chỉ giữ các phiên bản mới hơn. Nếu bạn cần cài đặt phiên bản cũ hơn, chẳng hạn như PHP 7.4, bạn cần cài đặt kho lưu trữ của bên thứ ba.
Chương trình sẽ tự động cài đặt theo mặc định, nhưng do vấn đề mạng và thiếu nguồn phản chiếu cho kho lưu trữ của bên thứ ba, việc cài đặt có thể không thành công. Trong trường hợp này, bạn có thể cài đặt thủ công. Lệnh cài đặt.
brew tap shivammathur/php`,
  brewNetIssues: `Nếu bạn không thể tải phiên bản, có thể là do vấn đề mạng, ví dụ, php, chương trình sẽ tự động cài đặt shivammathur/php làm kho lưu trữ của bên thứ ba theo mặc định, và không có nguồn phản chiếu trong kho lưu trữ, vì vậy nó sẽ bị kẹt ở đây, và bạn không thể tải phiên bản khả dụng.
Đề nghị là sử dụng VPN, lấy lệnh proxy terminal của phần mềm VPN, cấu hình nó trong Cài đặt->Cài đặt Proxy của phần mềm, và sau đó bật proxy, sau đó bạn có thể thử lại xem bạn có thể tải và cài đặt phiên bản không.`,
  brewSlowIssues: `Nếu phiên bản cài đặt rất chậm, có thể là do vấn đề mạng. Bạn có thể thử chuyển đổi nguồn phản chiếu Homebrew và thử lại. Một phương pháp được khuyến nghị hơn là sử dụng VPN
Lấy lệnh proxy terminal của phần mềm VPN, cấu hình nó trong Cài đặt->Cài đặt Proxy của phần mềm, và sau đó bật proxy, sau đó bạn có thể thử lại xem bạn có thể tải và cài đặt phiên bản không.`,
  macportsNotInstall: `MacPorts chưa được phát hiện trên hệ thống, nếu bạn muốn cài đặt, bạn có thể nhấp vào liên kết này
<a href="javascript:void();" onclick="openUrl('https://www.macports.org/install.php')">https://www.macports.org/install.php</a>
Làm theo tài liệu để cài đặt.
Sau khi cài đặt xong, bạn có thể chuyển đổi nguồn phản chiếu MacPorts trong Cài đặt để tăng tốc độ cài đặt phần mềm.`,
  macportsHasInstall: `MacPorts được phát hiện đã được cài đặt trên hệ thống.
Nếu bạn không thể cài đặt phần mềm, hoặc nếu nó cài đặt chậm, hãy thử chuyển đổi nguồn phản chiếu MacPorts trong Cài đặt.`,
  brewNotInstall: `Homebrew chưa được phát hiện trên hệ thống của bạn, nếu bạn muốn cài đặt, bạn có thể nhấp vào liên kết này
<a href="javascript:void();" onclick="openUrl('https://www.macphpstudy.com/guide/getting-started.html#macos-1')">https://www.macphpstudy.com/guide/getting-started.html#macos-1</a>
Làm theo tài liệu để cài đặt.
`,
  brewHasInstall: `Homebrew được phát hiện đã được cài đặt trên hệ thống.
Nếu bạn gặp vấn đề khi cài đặt hoặc gỡ cài đặt phần mềm từ trong ứng dụng, bạn có thể thử thực hiện các lệnh thủ công từ dòng lệnh`,
  mysqlPassword: `Mật khẩu tài khoản ban đầu cho cơ sở dữ liệu Mysql&MariaDB là root root
Chương trình không có công cụ quản lý dữ liệu cơ sở dữ liệu, nếu bạn cần thay đổi mật khẩu hoặc quản lý dữ liệu cơ sở dữ liệu, bạn có thể sử dụng cách sau:
phpMyAdmin <a href="javascript:void();" onclick="openUrl('https://www.phpmyadmin.net/')">https://www.phpmyadmin.net/</a>
Navicat <a href="javascript:void();" onclick="openUrl('https://www.navicat.com/')">https://www.navicat.com.cn/</a>
MySQL Workbench <a href="javascript:void();" onclick="openUrl('https://www.mysql.com/products/workbench/')">https://www.mysql.com/products/workbench/</a>
DataGrip <a href="javascript:void();" onclick="openUrl('https://www.jetbrains.com/datagrip/')">https://www.jetbrains.com/zh-cn/datagrip/</a>
DbGate <a href="javascript:void();" onclick="openUrl('https://dbgate.org/')">https://dbgate.org/</a>
DBeaver <a href="javascript:void();" onclick="openUrl('https://dbeaver.io/')">https://dbeaver.io/</a>
Nếu có bất kỳ công cụ nào khác mà bạn nghĩ là tốt, vui lòng liên hệ với tôi để thêm chúng.`
}
