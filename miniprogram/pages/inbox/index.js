const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

const PAGE_SIZE = 20;

Page({
  data: {
    activeType: "operation",
    keyword: "",
    messages: [],
    loading: false,
    exporting: false,
    page: 1,
    pageCount: 1,
    total: 0,
    canManage: false,
  },

  onLoad() {
    const user = authService.requireLogin();
    if (!user) return;
    if (user.role !== "admin") {
      wx.showToast({ title: "仅管理员可查看站内信", icon: "none" });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this.setData({ canManage: true });
    this.loadMessages();
  },

  onShow() {
    const user = authService.getCachedUser();
    if (user && user.role === "admin") this.setData({ canManage: true });
  },

  chooseType(event) {
    const type = event.currentTarget.dataset.type;
    if (type === this.data.activeType) return;
    this.setData({ activeType: type, page: 1 }, () => this.loadMessages());
  },

  inputKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  confirmKeyword(event) {
    this.setData({ keyword: event.detail.value || "", page: 1 }, () => this.loadMessages());
  },

  clearKeyword() {
    this.setData({ keyword: "", page: 1 }, () => this.loadMessages());
  },

  async loadMessages() {
    if (!this.data.canManage) return;
    const requestId = (this._requestId || 0) + 1;
    this._requestId = requestId;
    this.setData({ loading: true });
    try {
      const result = await treeService.listAdminMessages({
        messageType: this.data.activeType,
        keyword: this.data.keyword,
        page: this.data.page,
        pageSize: PAGE_SIZE,
      });
      if (requestId !== this._requestId) return;
      const payload = result.data || {};
      this.setData({
        messages: payload.data || [],
        page: payload.page || 1,
        pageCount: payload.totalPages || 1,
        total: payload.total || 0,
      });
    } catch (error) {
      if (requestId !== this._requestId) return;
      wx.showToast({ title: error.message || "站内信加载失败", icon: "none" });
      this.setData({ messages: [], total: 0, pageCount: 1 });
    } finally {
      if (requestId === this._requestId) this.setData({ loading: false });
    }
  },

  previousPage() {
    if (this.data.loading || this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadMessages());
  },

  nextPage() {
    if (this.data.loading || this.data.page >= this.data.pageCount) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadMessages());
  },

  async exportCurrent() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: "导出中" });
    try {
      const result = await treeService.exportAdminMessages(this.data.activeType);
      const fileID = result.data && result.data.fileID;
      if (!fileID) throw new Error("导出文件为空");
      const downloaded = await wx.cloud.downloadFile({ fileID });
      await new Promise((resolve, reject) => wx.openDocument({
        filePath: downloaded.tempFilePath,
        showMenu: true,
        success: resolve,
        fail: reject,
      }));
    } catch (error) {
      wx.showToast({ title: error.message || "导出失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ exporting: false });
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () => this.loadMessages().finally(() => wx.stopPullDownRefresh()));
  },
});
