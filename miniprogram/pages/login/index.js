const authService = require("../../services/authService");

Page({
  data: {
    logging: false,
  },

  onLoad() {
    if (authService.getCachedUser()) {
      wx.switchTab({ url: "/pages/index/index" });
    }
  },

  async doLogin(loginTask) {
    if (this.data.logging) return;
    this.setData({ logging: true });
    wx.showLoading({ title: "登录中" });
    try {
      await loginTask();
      wx.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => wx.switchTab({ url: "/pages/index/index" }), 300);
    } catch (error) {
      wx.showModal({
        title: "登录失败",
        content: error.message || "请确认已开通云开发，并部署 quickstartFunctions 云函数。",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ logging: false });
    }
  },

  login() {
    this.doLogin(() => authService.login());
  },

  loginByPhone(event) {
    const detail = event.detail || {};
    if (!detail.code) {
      wx.showToast({ title: "需要授权手机号后才能登录", icon: "none" });
      return;
    }
    this.doLogin(() => authService.loginByPhone(detail.code));
  },
});
