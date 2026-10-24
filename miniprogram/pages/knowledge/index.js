const treeService = require("../../services/treeService");
const authService = require("../../services/authService");

const PAGE_SIZE = 20;

const getErrorMessage = (error) => String((error && (error.message || error.errMsg)) || error || "");
const getExtension = (name) => {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
};
const safeFileName = (name) => String(name || "资料").replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
const fileExtension = (name) => getExtension(name).toUpperCase() || "FILE";

Page({
  data: {
    loading: false,
    uploading: false,
    deleting: false,
    canManage: false,
    keyword: "",
    category: "全部",
    categories: ["全部"],
    files: [],
    total: 0,
    page: 1,
    pageCount: 1,
    showUpload: false,
    uploadName: "",
    uploadCategory: "调查资料",
    uploadDescription: "",
    uploadPath: "",
    uploadFileID: "",
  },

  onLoad() {
    const user = authService.requireLogin();
    if (!user) return;
    this.setData({ canManage: user.role === "admin" });
    this.loadFiles();
  },

  onShow() {
    const user = authService.getCachedUser();
    this.setData({ canManage: !!(user && user.role === "admin") });
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () => this.loadFiles().finally(() => wx.stopPullDownRefresh()));
  },

  async loadFiles() {
    this.setData({ loading: true });
    try {
      const result = await treeService.listKnowledgeFiles({
        page: this.data.page,
        pageSize: PAGE_SIZE,
        keyword: this.data.keyword,
        category: this.data.category,
      });
      const payload = result.data || {};
      const files = (payload.data || []).map((file) => ({
        ...file,
        extension: fileExtension(file.name),
      }));
      this.setData({
        files,
        total: payload.total || 0,
        page: payload.page || 1,
        pageCount: payload.totalPages || 1,
        categories: ["全部", ...(payload.categories || []).filter((item) => item !== "全部")],
      });
    } catch (error) {
      console.error("load knowledge files failed", error);
      wx.showToast({ title: "资料加载失败", icon: "none" });
      this.setData({ files: [], total: 0, pageCount: 1 });
    } finally {
      this.setData({ loading: false });
    }
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onKeywordConfirm(event) {
    this.setData({ keyword: event.detail.value || this.data.keyword, page: 1 }, () => this.loadFiles());
  },

  chooseCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category, page: 1 }, () => this.loadFiles());
  },

  clearKeyword() {
    this.setData({ keyword: "", page: 1 }, () => this.loadFiles());
  },

  previousPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadFiles());
  },

  nextPage() {
    if (this.data.page >= this.data.pageCount) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadFiles());
  },

  async downloadFile(event) {
    const file = event.currentTarget.dataset.file;
    if (!file || !file.fileID) return;
    wx.showLoading({ title: "下载中" });
    try {
      const result = await wx.cloud.downloadFile({ fileID: file.fileID });
      treeService.logOperation("knowledge_download", {
        title: "下载知识库文件",
        summary: file.name || "资料文件",
        targetType: "knowledgeFile",
        targetId: file.id || "",
        details: { fileName: file.name || "", category: file.category || "" },
      }).catch(() => {});
      const saved = await new Promise((resolve, reject) => {
        wx.saveFile({ tempFilePath: result.tempFilePath, success: resolve, fail: reject });
      });
      const extension = getExtension(file.name);
      const supported = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension);
      if (!supported) {
        wx.showModal({
          title: "下载完成",
          content: "文件已下载到微信临时目录，当前格式不支持直接预览。",
          showCancel: false,
        });
        return;
      }
      await new Promise((resolve, reject) => {
        wx.openDocument({
          filePath: saved.savedFilePath || result.tempFilePath,
          fileType: extension,
          showMenu: true,
          success: resolve,
          fail: reject,
        });
      });
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error) || "文件下载失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  openUpload() {
    this.setData({
      showUpload: true,
      uploadName: "",
      uploadCategory: "调查资料",
      uploadDescription: "",
      uploadPath: "",
      uploadFileID: "",
    });
  },

  closeUpload() {
    if (this.data.uploading) return;
    this.setData({ showUpload: false });
  },

  chooseMessageFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.setData({ uploadName: file.name || "资料文件", uploadPath: file.path, uploadFileID: "" });
      },
      fail: (error) => {
        if (!/cancel/i.test(getErrorMessage(error))) wx.showToast({ title: "未选择文件", icon: "none" });
      },
    });
  },

  onUploadInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async submitUpload() {
    if (!this.data.uploadPath || !this.data.uploadName) {
      wx.showToast({ title: "请先选择文件", icon: "none" });
      return;
    }
    this.setData({ uploading: true });
    wx.showLoading({ title: "上传中" });
    try {
      const extension = getExtension(this.data.uploadName);
      const cloudPath = `forest-health/knowledge/${Date.now()}-${safeFileName(this.data.uploadName)}`;
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: this.data.uploadPath });
      await treeService.saveKnowledgeFile({
        name: this.data.uploadName,
        category: this.data.uploadCategory || "其他",
        description: this.data.uploadDescription,
        fileID: upload.fileID,
        extension,
      });
      wx.showToast({ title: "上传成功" });
      this.setData({ showUpload: false, page: 1 });
      this.loadFiles();
    } catch (error) {
      wx.showModal({ title: "上传失败", content: getErrorMessage(error) || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  async deleteFile(event) {
    const file = event.currentTarget.dataset.file;
    if (!file || !file.id) return;
    const modal = await new Promise((resolve) => wx.showModal({
      title: "删除资料",
      content: `确认删除“${file.name}”吗？删除后用户将无法下载。`,
      confirmColor: "#FA5151",
      success: resolve,
    }));
    if (!modal.confirm) return;
    this.setData({ deleting: true });
    try {
      await treeService.deleteKnowledgeFile(file.id);
      wx.showToast({ title: "已删除" });
      this.loadFiles();
    } catch (error) {
      wx.showToast({ title: getErrorMessage(error) || "删除失败", icon: "none" });
    } finally {
      this.setData({ deleting: false });
    }
  },

  stop() {},
});
