const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: false,
    exporting: false,
    ancientImporting: false,
    ancientImportProgress: 0,
    user: null,
    canManage: false,
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

  goAncient() {
    wx.navigateTo({ url: "/pages/ancient/index" });
  },

  goInbox() {
    wx.navigateTo({ url: "/pages/inbox/index" });
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

  async restoreAncientTrees() {
    const modal = await new Promise((resolve) => {
      wx.showModal({
        title: "恢复古树名木",
        content: "将从正式数据恢复 2300 条古树名木档案，已存在的编号会被更新。仅管理员可操作。",
        confirmColor: "#07C160",
        success: resolve,
      });
    });
    if (!modal.confirm) return;

    this.setData({ ancientImporting: true, ancientImportProgress: 0 });
    wx.showLoading({ title: "恢复中 0%" });
    let offset = 0;
    let total = 2300;
    let imported = 0;
    try {
      while (offset < total) {
        const res = await treeService.importAncientTrees({ offset, limit: 50 });
        const payload = res.data || {};
        total = Number(payload.total || total);
        const nextOffset = Number(payload.nextOffset);
        if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
          throw new Error("恢复进度异常，请稍后重试");
        }
        imported += Number(payload.inserted || 0);
        offset = nextOffset;
        const progress = Math.min(100, Math.round((offset / total) * 100));
        this.setData({ ancientImportProgress: progress });
        wx.showLoading({ title: `恢复中 ${progress}%` });
      }
      wx.showModal({
        title: "恢复完成",
        content: `已恢复 ${imported} 条古树名木档案。`,
        showCancel: false,
      });
    } catch (error) {
      wx.showModal({
        title: "恢复失败",
        content: error.message || "请确认当前用户是管理员，并已重新部署云函数。",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ ancientImporting: false });
      this.loadStats();
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
