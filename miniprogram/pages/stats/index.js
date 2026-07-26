const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: false,
    exporting: false,
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
    if (!authService.requireLogin()) return;
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
