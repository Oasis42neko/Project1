const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

const PAGE_SIZE = 15;
const FILTERS = ["全部", "一级古树", "二级古树", "三级古树"];
const ISSUE_TYPES = ["健康异常", "病害", "虫害", "人为损伤", "其他"];
const ISSUE_SEVERITIES = ["一般", "较急", "紧急"];

Page({
  data: {
    filters: FILTERS,
    activeFilter: "全部",
    keyword: "",
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    filteredCount: 0,
    pageCount: 1,
    grandTotal: 0,
    loading: true,
    summary: {
      total: 0,
      withCoordinates: 0,
      withoutCoordinates: 0,
    },
    trees: [],
    selectedTree: null,
    showDetail: false,
    canReportIssue: false,
    showIssueForm: false,
    issueSaving: false,
    issueTypes: ISSUE_TYPES,
    issueSeverities: ISSUE_SEVERITIES,
    issueForm: {
      issueType: ISSUE_TYPES[0],
      severity: ISSUE_SEVERITIES[0],
      description: "",
      remark: "",
    },
  },

  onLoad() {
    const user = authService.getCachedUser();
    this.setData({ canReportIssue: !!user });
    this.loadTrees();
  },

  async loadTrees() {
    const requestId = (this._listRequestId || 0) + 1;
    this._listRequestId = requestId;
    this.setData({ loading: true });
    try {
      const result = await treeService.listAncientTrees({
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        level: this.data.activeFilter,
      });
      const data = result.data || {};
      if (requestId !== this._listRequestId) return;
      const trees = (data.data || []).map((tree) => {
        const hasLocation = !!(tree.latitude && tree.longitude);
        const status = !tree.status || String(tree.status).indexOf("?") >= 0
          ? (hasLocation ? "已定位" : "待补坐标")
          : tree.status;
        return {
          ...tree,
          id: tree._id || tree.id || tree.treeNo,
          displayNo: tree.treeNo || tree.id || tree._id,
          status,
          statusClass: tree.statusClass || (hasLocation ? "healthy" : "watch"),
        };
      });
      this.setData({
        trees,
        total: data.total || 0,
        filteredCount: data.total || 0,
        page: data.page || 1,
        pageCount: data.totalPages || 1,
        grandTotal: data.total || 0,
        summary: data.summary || {
          total: data.total || 0,
          withCoordinates: 0,
          withoutCoordinates: 0,
        },
      });
    } catch (error) {
      if (requestId !== this._listRequestId) return;
      console.error("load ancient trees failed", error);
      wx.showToast({ title: "古树数据加载失败", icon: "none" });
      this.setData({ trees: [], total: 0, filteredCount: 0, pageCount: 1, grandTotal: 0 });
    } finally {
      if (requestId === this._listRequestId) this.setData({ loading: false });
    }
  },

  onPullDownRefresh() {
    this.loadTrees().finally(() => wx.stopPullDownRefresh());
  },

  chooseFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.filter, page: 1 }, () => this.loadTrees());
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onKeywordConfirm(event) {
    this.setData({ keyword: event.detail.value || this.data.keyword, page: 1 }, () => this.loadTrees());
  },

  clearKeyword() {
    if (!this.data.keyword) return;
    this.setData({ keyword: "", page: 1 }, () => this.loadTrees());
  },

  prevPage() {
    if (this.data.loading) return;
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadTrees());
  },

  nextPage() {
    if (this.data.loading) return;
    if (this.data.page >= this.data.pageCount) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadTrees());
  },

  openDetail(event) {
    const tree = this.data.trees.find((item) => String(item._id || item.id || item.treeNo) === String(event.currentTarget.dataset.id));
    if (!tree) return;
    this.setData({
      selectedTree: { ...tree, detailImages: [], coverImage: "" },
      showDetail: true,
    });
    this.loadDetailImages(tree);
  },

  async loadDetailImages(tree) {
    const sourceImages = Array.isArray(tree.images) && tree.images.length
      ? tree.images
      : tree.image
        ? [tree.image]
        : [];
    if (!sourceImages.length) return;
    const tempFiles = sourceImages.filter((src) => String(src).startsWith("cloud://"));
    const directImages = sourceImages.filter((src) => !String(src).startsWith("cloud://"));
    let resolved = [...directImages];
    if (tempFiles.length) {
      try {
        const result = await wx.cloud.getTempFileURL({ fileList: tempFiles });
        const map = {};
        (result.fileList || []).forEach((item, index) => {
          map[tempFiles[index]] = item.tempFileURL || item.download_url || "";
        });
        resolved = sourceImages.map((src) => map[src] || src).filter(Boolean);
      } catch (error) {
        resolved = sourceImages.filter(Boolean);
      }
    }
    if (!resolved.length) return;
    const selected = this.data.selectedTree;
    if (!selected) return;
    const sameTree = String(selected._id || selected.id || selected.treeNo) === String(tree._id || tree.id || tree.treeNo);
    if (!sameTree) return;
    this.setData({
      selectedTree: {
        ...selected,
        detailImages: resolved,
        coverImage: resolved[0] || "",
      },
    });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  stop() {},

  reportIssue() {
    const user = authService.getCachedUser();
    if (!user) {
      authService.requireLogin();
      return;
    }
    this.setData({
      showIssueForm: true,
      issueForm: {
        issueType: ISSUE_TYPES[0],
        severity: ISSUE_SEVERITIES[0],
        description: "",
        remark: "",
      },
    });
  },

  closeIssueForm() {
    if (this.data.issueSaving) return;
    this.setData({ showIssueForm: false });
  },

  inputIssue(event) {
    const key = event.currentTarget.dataset.key;
    const update = {};
    update["issueForm." + key] = event.detail.value;
    this.setData(update);
  },

  chooseIssueType() {
    wx.showActionSheet({
      itemList: ISSUE_TYPES,
      success: (res) => this.setData({ "issueForm.issueType": ISSUE_TYPES[res.tapIndex] }),
    });
  },

  chooseIssueSeverity() {
    wx.showActionSheet({
      itemList: ISSUE_SEVERITIES,
      success: (res) => this.setData({ "issueForm.severity": ISSUE_SEVERITIES[res.tapIndex] }),
    });
  },

  async submitIssue() {
    const tree = this.data.selectedTree || {};
    const form = this.data.issueForm || {};
    const description = String(form.description || "").trim();
    const location = String(tree.location || "").trim();
    if (!tree.treeNo && !tree.displayNo) {
      wx.showToast({ title: "古树编号缺失", icon: "none" });
      return;
    }
    if (!location) {
      wx.showToast({ title: "古树位置为空，无法提交", icon: "none" });
      return;
    }
    if (description.length < 5) {
      wx.showToast({ title: "异常情况至少填写5个字符", icon: "none" });
      return;
    }
    if (this.data.issueSaving) return;
    this.setData({ issueSaving: true });
    wx.showLoading({ title: "提交中" });
    try {
      await treeService.saveAncientIssue({
        treeNo: tree.treeNo || tree.displayNo,
        species: tree.species || "",
        location,
        latitude: tree.latitude || "",
        longitude: tree.longitude || "",
        issueType: form.issueType,
        severity: form.severity,
        description,
        remark: String(form.remark || "").trim(),
      });
      this.setData({ showIssueForm: false, showDetail: false });
      wx.showToast({ title: "已提交，管理员可查看", icon: "success" });
    } catch (error) {
      wx.showModal({ title: "提交失败", content: error.message || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ issueSaving: false });
    }
  },

  goMap() {
    wx.switchTab({ url: "/pages/map/index" });
  },
});
