const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: true,
    user: null,
    userTag: "",
    stats: { total: 0, plots: 0, species: 0, pendingReview: 0, abnormal: 0 },
    healthCards: [],
    recentRecords: [],
  },

  onShow() {
    const user = authService.requireLogin();
    if (!user) return;
    this.setData({ user, userTag: user.openid ? user.openid.slice(-6) : "" });
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      await treeService.initProject();
      const statsRes = await treeService.getStats();
      const listRes = await treeService.listTrees({ limit: 5 });
      this.setData({ stats: statsRes.data.summary, healthCards: statsRes.data.byHealth, recentRecords: listRes.data || [] });
    } catch (error) {
      wx.showModal({ title: "数据初始化失败", content: error && error.message ? error.message : "请确认已开通微信云开发，并重新部署 quickstartFunctions 云函数。", showCancel: false });
      console.error("loadForestDashboard failed", error);
    } finally {
      this.setData({ loading: false });
    }
  },

  logout() {
    wx.showModal({ title: "退出登录", content: "退出后需要重新登录才能查看和录入共享数据。", confirmColor: "#FA5151", success: (res) => {
      if (!res.confirm) return;
      authService.clearCachedUser();
      wx.reLaunch({ url: "/pages/login/index" });
    } });
  },

  goCreate() { wx.navigateTo({ url: "/pages/form/index" }); },
  goMap() { wx.switchTab({ url: "/pages/map/index" }); },
  goRecords() { wx.switchTab({ url: "/pages/record/index" }); },
  goStats() { wx.switchTab({ url: "/pages/stats/index" }); },
});
