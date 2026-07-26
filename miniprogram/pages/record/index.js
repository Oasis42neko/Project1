const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: false,
    keyword: "",
    records: [],
  },

  onShow() {
    if (!authService.requireLogin()) return;
    this.loadRecords();
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onSearch() {
    this.loadRecords();
  },

  async loadRecords() {
    this.setData({ loading: true });
    try {
      const res = await treeService.listTrees({
        keyword: this.data.keyword,
        limit: 100,
      });
      this.setData({ records: res.data || [] });
    } catch (error) {
      wx.showToast({ title: "档案加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/form/index" });
  },

  editRecord(event) {
    wx.navigateTo({ url: `/pages/form/index?id=${event.currentTarget.dataset.id}` });
  },

  async deleteRecord(event) {
    const id = event.currentTarget.dataset.id;
    const modal = await new Promise((resolve) => {
      wx.showModal({
        title: "删除档案",
        content: "删除后无法恢复，确认删除这份树木档案吗？",
        confirmColor: "#B84232",
        success: resolve,
      });
    });
    if (!modal.confirm) return;

    wx.showLoading({ title: "删除中" });
    try {
      await treeService.deleteTree(id);
      wx.showToast({ title: "已删除" });
      this.loadRecords();
    } catch (error) {
      wx.showToast({ title: "删除失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});
