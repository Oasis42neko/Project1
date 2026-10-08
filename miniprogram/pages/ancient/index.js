const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

const PAGE_SIZE = 15;
const FILTERS = ["全部", "一级古树", "二级古树", "三级古树"];

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
  },

  onLoad() {
    const user = authService.getCachedUser();
    this.setData({ canReportIssue: !!(user && user.role === "admin") });
    this.loadTrees();
  },

  async loadTrees() {
    this.setData({ loading: true });
    try {
      const result = await treeService.listTrees({
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        level: this.data.activeFilter,
      });
      const data = result.data || {};
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
      console.error("load ancient trees failed", error);
      wx.showToast({ title: "古树数据加载失败", icon: "none" });
      this.setData({ trees: [], total: 0, filteredCount: 0, pageCount: 1, grandTotal: 0 });
    } finally {
      this.setData({ loading: false });
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
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadTrees());
  },

  nextPage() {
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
    if (!user || user.role !== "admin") {
      wx.showToast({ title: "仅管理员可上报异常", icon: "none" });
      return;
    }
    const tree = this.data.selectedTree || {};
    const params = {
      from: "ancient",
      treeNo: tree.treeNo || tree.displayNo || "",
      species: tree.species || "",
      location: tree.location || "",
      latitude: tree.latitude || "",
      longitude: tree.longitude || "",
      altitude: tree.altitude || "",
    };
    const query = Object.keys(params)
      .filter((key) => params[key] !== "" && params[key] !== undefined && params[key] !== null)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
      .join("&");
    this.closeDetail();
    wx.showToast({ title: "已打开上报入口", icon: "none" });
    setTimeout(() => wx.navigateTo({ url: `/pages/pest/index?${query}` }), 350);
  },

  goMap() {
    wx.switchTab({ url: "/pages/map/index" });
  },
});