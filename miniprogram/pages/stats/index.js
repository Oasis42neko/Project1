const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: false,
    exporting: false,
    user: null,
    canManage: false,
    seeding: false,
    summary: {
      total: 0,
      plots: 0,
      species: 0,
      pendingReview: 0,
      abnormal: 0,
    },
    byHealth: [],
    byPlot: [],
    bySpecies: [],
    exportFileID: "",
  },

  onShow() {
    const user = authService.requireLogin();
    if (!user) return;
    this.setData({ user, canManage: user.role === "admin" });
    this.loadStats();
  },

  async loadStats() {
    this.setData({ loading: true });
    try {
      const res = await treeService.getStats();
      this.setData(res.data);
    } catch (error) {
      wx.showToast({ title: "统计加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goUsers() {
    wx.navigateTo({ url: "/pages/users/index" });
  },

  async exportCsv() {
    this.setData({ exporting: true });
    wx.showLoading({ title: "导出中" });
    try {
      const res = await treeService.exportTrees();
      this.setData({ exportFileID: res.data.fileID });
      wx.showToast({ title: "导出完成" });
    } catch (error) {
      wx.showToast({ title: "导出失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ exporting: false });
    }
  },



  async seedDemoData() {
    const modal = await new Promise((resolve) => {
      wx.showModal({
        title: "导入演示数据",
        content: "将生成 45 条测试树木档案，包含在线测试图片。仅管理员可操作。",
        confirmColor: "#07C160",
        success: resolve,
      });
    });
    if (!modal.confirm) return;

    this.setData({ seeding: true });
    wx.showLoading({ title: "导入中" });
    try {
      const res = await treeService.seedDemoData();
      wx.showModal({
        title: "导入完成",
        content: res.data.message || `已导入 ${res.data.inserted} 条演示数据`,
        showCancel: false,
      });
      this.loadStats();
    } catch (error) {
      wx.showModal({
        title: "导入失败",
        content: error.message || "请确认当前用户是管理员，并已重新部署云函数。",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ seeding: false });
    }
  },

  downloadExport() {
    if (!this.data.exportFileID) return;
    wx.cloud.downloadFile({
      fileID: this.data.exportFileID,
      success: (res) => {
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => wx.showToast({ title: "请从云存储下载文件", icon: "none" }),
        });
      },
      fail: () => wx.showToast({ title: "下载失败", icon: "none" }),
    });
  },
});
