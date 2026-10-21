// Cấu hình phía app (phụ lục 1.5 mục 2.4). Chỉ 4 giá trị, không có bí mật.
// Cùng một mã chạy ở hai trang; app chọn máy chủ theo thư mục của trang:
//   /ME/     THẬT — repo ME, nhánh main (APP_BASE_URL chính thức, in trên tem QR)
//   /ME-thu/ THỬ  — repo ME-thu (bản sao mã), chỉ dữ liệu mẫu
// Trang khác (máy thử của người code): để trống, nhập link /exec tạm ở màn đăng nhập.
(function () {
  var THAT = 'https://script.google.com/macros/s/AKfycbw5HdtReLaA2t_wWTz-cmn-3PmxDkHksrRJ_hWH4P32Ayf8PDdjpkv4MYkRBkVq74Yz/exec'; // ME_MayChu_THAT
  var THU = 'https://script.google.com/macros/s/AKfycbx1VfL34FkUruqbza59AzLrKWvNhd3YC9UkKGnQC5sooaqA6VKn9XCwuAxAhBYOpMYh/exec'; // ME_MayChu_THU
  var SITES = {
    '/ME/': { base: 'https://luongquangdao8386-ops.github.io/ME/', exec: THAT },
    '/ME-thu/': { base: 'https://luongquangdao8386-ops.github.io/ME-thu/', exec: THU }
  };
  var m = /^\/[^/]+\//.exec(location.pathname);
  var site = (m && SITES[m[0]]) || { base: '', exec: '' };
  window.ME_CONFIG = {
    APP_BASE_URL: site.base,
    EXEC_URL: site.exec,
    API_CONTRACT_VERSION: '1.0',
    BUILD_VERSION: '1.0.0-d4.7'
  };
})();
