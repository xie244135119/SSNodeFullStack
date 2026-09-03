// 由 scripts/ 部署脚本自动生成，勿手改；源: web/public/env.config.js
window.ENV = (() => ({
  // runtime console
  console: false,
  // 是否需要登录 <false：忽略登录>
  checkToken: false,
  // 网络请求前缀 <同源部署留空；二级目录或网关前缀填此处>
  requestBaseUrl: ""
}))();

if (window.ENV.console === false) {
  console.log = function (oriLogFunc) {
    return function () {
      oriLogFunc.apply(this, arguments);
    };
  };
}
