export default {
  name: 'trang web',
  mark: 'đánh dấu',
  setup: 'cài đặt',
  phpVersion: 'phiên bản php',
  newProject: 'Dự án mới',
  dir: 'Thư mục',
  frameWork: 'Framework',
  newProjectTips: 'Tạo một dự án mới bằng composer, khởi tạo với framework đã chọn, hỗ trợ: wordpress, laravel, yii2, symfony, thinkphp, codeIgniter, cakephp, slim',
  toCreateHost: 'Tạo Host',
  dnsInfo:
    'Bật máy chủ DNS. Phân giải tên miền được đặt trong tệp /etc/hosts thành IP cục bộ. Chủ yếu được sử dụng cho các máy tính hoặc điện thoại khác trên mạng LAN để truy cập trang web cục bộ. \n' +
    `Tính năng này yêu cầu Node, vì vậy nếu bạn chưa cài đặt, vui lòng cài đặt trước.\n` +
    'Cách sử dụng.\n' +
    '1. Khởi động máy chủ DNS.\n' +
    '2. Trên các máy tính hoặc điện thoại khác, đặt DNS của mạng, nhập IP DNS hiển thị trong giao diện hiện tại. Tốt nhất là chỉ giữ lại cài đặt DNS này, sau đó khôi phục cài đặt ban đầu sau khi không còn sử dụng.\n' +
    '3. Sử dụng lệnh này để kiểm tra: dig {ip} domain\n' +
    '4. Trên các máy tính hoặc điện thoại khác, sử dụng tên miền của trang web cục bộ để truy cập.\n',
  staticSite: 'Trang web tĩnh',
  park: 'Tạo trang web con',
  hostsCopy: 'Sao chép nội dung hosts',
  hostsOpen: 'Mở tệp hosts tùy chỉnh',

  placeholderName: 'Tên máy chủ, ví dụ: www.xxx.com',
  placeholderAlias: 'Bí danh máy chủ, ví dụ: www.xxx.com',
  placeholderRemarks: 'Ghi chú máy chủ',
  placeholderRootPath: 'Đường dẫn gốc máy chủ',
  hostPort: 'Cổng',
  hostSSL: 'SSL',

  parkConfim: 'Chắc chắn tạo các trang web dựa trên các thư mục con?',

  autoSSL: 'Chứng chỉ SSL tự động',

  phpMyAdminInstallTips: 'Không tìm thấy trang web phpMyAdmin với tên miền phpmyadmin.phpwebstudy.test, Tải xuống phpMyAdmin và tạo trang web?',
  phpMyAdminTaskRunning: 'Đang tải xuống phpMyAdmin và tạo trang web',

  warning: 'Cảnh báo',
  noPhpWarning: 'Kiểm tra thấy không có phiên bản PHP nào được chọn, một trang web tĩnh sẽ được tạo và các tệp PHP sẽ không thể thực thi. Bạn có chắc chắn muốn tiếp tục không?',

  enable: 'Bật',

  hostsWriteTips: 'Bật / Tắt tất cả các host trong danh sách này',

  sort: 'Sắp xếp'
}
