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

  async login() {
    this.setData({ logging: true });
    wx.showLoading({ title: "登录中" });
    try {
      await authService.login();
      wx.showToast({ title: "登录成功" });
      setTimeout(() => wx.switchTab({ url: "/pages/index/index" }), 300);
    } catch (error) {
      wx.showModal({
        title: "登录失败",
        content: "请确认已开通云开发并部署 quickstartFunctions 云函数。",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ logging: false });
    }
  },
});
