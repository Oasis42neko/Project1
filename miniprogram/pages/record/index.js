const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

Page({
  data: {
    loading: false,
    keyword: "",
    records: [],
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 1,
  },

  onShow() {
    if (!authService.requireLogin()) return;
    this.loadRecords();
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onSearch() {
    this.setData({ page: 1 }, () => this.loadRecords());
  },

  async resolveCoverUrls(records) {
    const nextRecords = records.map((record) => ({
      ...record,
      coverUrl: record.images && record.images.length ? record.images[0] : "",
    }));
    const cloudFileList = nextRecords
      .filter((record) => record.coverUrl && String(record.coverUrl).startsWith("cloud://"))
      .map((record) => record.coverUrl);
    if (!cloudFileList.length) return nextRecords;

    try {
      const tempRes = await wx.cloud.getTempFileURL({ fileList: cloudFileList });
      const urlMap = (tempRes.fileList || []).reduce((map, item) => {
        map[item.fileID] = item.tempFileURL;
        return map;
      }, {});
      return nextRecords.map((record) => ({
        ...record,
        coverUrl: urlMap[record.coverUrl] || record.coverUrl,
      }));
    } catch (error) {
      return nextRecords;
    }
  },

  async loadRecords() {
    this.setData({ loading: true });
    try {
      const res = await treeService.listTrees({
        keyword: this.data.keyword,
        page: this.data.page,
        pageSize: this.data.pageSize,
      });
      const payload = res.data || {};
      const records = await this.resolveCoverUrls(payload.data || []);
      this.setData({
        records,
        total: payload.total || 0,
        totalPages: payload.totalPages || 1,
        page: payload.page || this.data.page,
      });
    } catch (error) {
      wx.showModal({ title: "档案加载失败", content: error.message || "请稍后重试", showCancel: false });
    } finally {
      this.setData({ loading: false });
    }
  },

  prevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadRecords());
  },

  nextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadRecords());
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
        confirmColor: "#FA5151",
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
      wx.showModal({ title: "删除失败", content: error.message || "权限不足或网络异常", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },
});
