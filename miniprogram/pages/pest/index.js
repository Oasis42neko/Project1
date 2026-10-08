const pestService = require("../../services/pestService");
const authService = require("../../services/authService");
const treeService = require("../../services/treeService");
const { validatePestReport } = require("../../utils/validators");
const { formatCoordinateDms } = require("../../utils/coordinateUtils");

const PEST_TYPE_DISEASE = "\u75c5\u5bb3";
const PEST_TYPE_INSECT = "\u866b\u5bb3";
const STATUS_PENDING = "\u5f85\u5ba1\u6838";
const STATUS_ACCEPTED = "\u5df2\u53d7\u7406";
const STATUS_CLOSED = "\u5df2\u529e\u7ed3";
const STATUS_REJECTED = "\u5df2\u9a73\u56de";
const SEVERITY_GENERAL = "\u4e00\u822c";
const SEVERITY_MODERATE = "\u8f83\u6025";
const SEVERITY_URGENT = "\u7d27\u6025";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getErrorText = (error) => String((error && (error.errMsg || error.message)) || error || "");
const isUploadNetworkError = (error) => /timeout|network|request:fail|uploadFile:fail|ECONNRESET/i.test(getErrorText(error));

const uploadCloudFileWithRetry = async (options, retryCount = 2) => {
  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await wx.cloud.uploadFile(options);
    } catch (error) {
      lastError = error;
      if (!isUploadNetworkError(error) || attempt === retryCount) break;
      await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
};

const emptyRecognition = () => ({
  visible: false,
  category: "",
  name: "",
  severity: "",
  confidence: "",
  description: "",
  reason: "",
  candidates: [],
  uncertain: false,
});

const emptyForm = () => ({
  type: PEST_TYPE_DISEASE,
  severity: SEVERITY_GENERAL,
  location: "",
  description: "",
  image: "",
  latitude: "",
  longitude: "",
  accuracy: "",
  altitude: "",
  locationSource: "",
  uploadedFileId: "",
  uploadedLocalPath: "",
  relatedTreeNo: "",
  relatedSpecies: "",
});

const DEMO_REPORTS = [
  {
    id: "PST-202608-001",
    type: PEST_TYPE_DISEASE,
    title: "\u53f6\u7247\u51fa\u73b0\u8910\u8272\u6591\u5757",
    location: "\u6f6e\u5b89\u533a\u51e4\u51f0\u9547",
    status: STATUS_PENDING,
    statusClass: "pending",
    severity: SEVERITY_GENERAL,
    date: "2026-08-12",
    image: "/assets/home/forest-pest.jpg",
    images: ["/assets/home/forest-pest.jpg"],
    description: "\u73b0\u573a\u53d1\u73b0\u90e8\u5206\u53f6\u7247\u6709\u4e0d\u89c4\u5219\u8910\u8272\u6591\u5757\uff0c\u9700\u8981\u5b89\u6392\u4eba\u5458\u590d\u6838\u3002",
  },
  {
    id: "PST-202608-002",
    type: PEST_TYPE_INSECT,
    title: "\u6811\u5e72\u53d1\u73b0\u866b\u5bb3\u5b54\u6d1e",
    location: "\u9976\u5e73\u53bf\u51e4\u51f0\u5c71\u7247\u533a",
    status: STATUS_ACCEPTED,
    statusClass: "accepted",
    severity: SEVERITY_MODERATE,
    date: "2026-08-09",
    image: "/assets/home/forest-pest.jpg",
    images: ["/assets/home/forest-pest.jpg"],
    description: "\u6811\u5e72\u4e0b\u90e8\u53d1\u73b0\u591a\u4e2a\u5b54\u6d1e\uff0c\u5468\u56f4\u6709\u6728\u5c51\uff0c\u5efa\u8bae\u5c3d\u5feb\u73b0\u573a\u786e\u8ba4\u3002",
  },
  {
    id: "PST-202608-003",
    type: PEST_TYPE_DISEASE,
    title: "\u679d\u68a2\u67af\u840e",
    location: "\u6e58\u6865\u533a\u610f\u6eaa\u9547",
    status: STATUS_CLOSED,
    statusClass: "closed",
    severity: SEVERITY_GENERAL,
    date: "2026-08-02",
    image: "/assets/home/forest-pest.jpg",
    images: ["/assets/home/forest-pest.jpg"],
    description: "\u5df2\u5b8c\u6210\u73b0\u573a\u590d\u6838\u548c\u4fee\u679d\u5904\u7406\uff0c\u540e\u7eed\u7ee7\u7eed\u89c2\u5bdf\u3002",
  },
];

const decodeOption = (value) => {
  try {
    return value ? decodeURIComponent(value) : "";
  } catch (error) {
    return value || "";
  }
};

const hasCoordinatePair = (latitude, longitude) => Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

const formatCoordinatePair = (latitude, longitude) => {
  if (!hasCoordinatePair(latitude, longitude)) return "";
  const lat = formatCoordinateDms(Number(latitude));
  const lon = formatCoordinateDms(Number(longitude));
  return lat && lon ? `\u7eac\u5ea6 ${lat}\uff0c\u7ecf\u5ea6 ${lon}` : "";
};

Page({
  data: {
    filters: ["\u5168\u90e8", PEST_TYPE_DISEASE, PEST_TYPE_INSECT, "\u5f85\u5904\u7406"],
    activeFilter: "\u5168\u90e8",
    reports: [],
    selectedReport: null,
    showDetail: false,
    showForm: false,
    loadingReports: false,
    recognizingPest: false,
    savingReport: false,
    locating: false,
    locationHint: "",
    canManageReports: false,
    pestRecognition: emptyRecognition(),
    form: emptyForm(),
  },

  onLoad(options = {}) {
    const user = authService.getCachedUser();
    this.setData({ canManageReports: !!(user && user.role === "admin") });
    this.applyFilter("\u5168\u90e8");

    if (options.from !== "ancient") return;

    const treeNo = decodeOption(options.treeNo);
    const species = decodeOption(options.species);
    const location = decodeOption(options.location);
    const latitude = options.latitude !== undefined && options.latitude !== "" ? Number(options.latitude) : "";
    const longitude = options.longitude !== undefined && options.longitude !== "" ? Number(options.longitude) : "";
    const altitude = options.altitude !== undefined && options.altitude !== "" ? Number(options.altitude) : "";
    const relation = [species, treeNo ? `\u7f16\u53f7\uff1a${treeNo}` : ""].filter(Boolean).join(" / ");
    const coordinateText = formatCoordinatePair(latitude, longitude);
    const placeholderLocation = /^(\u6682\u65e0\u4f4d\u7f6e\u63cf\u8ff0|\u6682\u65e0|\u5f85\u8865|\u672a\u77e5)$/;
    const locationText = !location || placeholderLocation.test(location.trim())
      ? (coordinateText || (relation ? `\u53e4\u6811\u4f4d\u7f6e\uff08${relation}\uff09` : ""))
      : location;

    this.setData({
      showForm: true,
      locationHint: "\u5df2\u5e26\u5165\u53e4\u6811\u6863\u6848\u4f4d\u7f6e\u4fe1\u606f\uff0c\u53ef\u7ee7\u7eed\u624b\u52a8\u4fee\u6539\u3002",
      form: {
        ...emptyForm(),
        location: locationText,
        latitude,
        longitude,
        altitude,
        locationSource: "ancient",
        relatedTreeNo: treeNo,
        relatedSpecies: species,
      },
    });
  },

  onShow() {
    const user = authService.getCachedUser();
    this.setData({ canManageReports: !!(user && user.role === "admin") });
  },

  onPullDownRefresh() {
    this.applyFilter(this.data.activeFilter).finally(() => wx.stopPullDownRefresh());
  },

  async applyFilter(filter) {
    this.setData({ activeFilter: filter, loadingReports: true });
    try {
      const result = await pestService.listPestReports({ filter, page: 1, pageSize: 20 });
      const data = result.data || {};
      const reports = data.data && data.data.length
        ? await this.resolveReportImages(data.data)
        : this.filterDemoReports(filter);
      this.setData({ reports });
    } catch (error) {
      console.error("load pest reports failed", error);
      wx.showToast({ title: "\u75c5\u866b\u5bb3\u6570\u636e\u52a0\u8f7d\u5931\u8d25", icon: "none" });
      this.setData({ reports: this.filterDemoReports(filter) });
    } finally {
      this.setData({ loadingReports: false });
    }
  },

  filterDemoReports(filter) {
    let reports = DEMO_REPORTS;
    if (filter === PEST_TYPE_DISEASE || filter === PEST_TYPE_INSECT) {
      reports = reports.filter((report) => report.type === filter);
    }
    if (filter === "\u5f85\u5904\u7406") {
      reports = reports.filter((report) => [STATUS_PENDING, STATUS_ACCEPTED].includes(report.status));
    }
    return reports;
  },

  async resolveReportImages(reports) {
    const list = [];
    for (const report of reports) {
      const images = Array.isArray(report.images) && report.images.length
        ? report.images
        : report.image
          ? [report.image]
          : [];
      if (!images.length) {
        list.push({ ...report, images: [], image: "" });
        continue;
      }
      const cloudFiles = images.filter((src) => String(src).startsWith("cloud://"));
      if (!cloudFiles.length) {
        list.push({ ...report, images, image: images[0] || "" });
        continue;
      }
      try {
        const result = await wx.cloud.getTempFileURL({ fileList: cloudFiles });
        const tempMap = {};
        (result.fileList || []).forEach((item, index) => {
          tempMap[cloudFiles[index]] = item.tempFileURL || item.download_url || "";
        });
        const resolved = images.map((src) => tempMap[src] || src).filter(Boolean);
        list.push({ ...report, images: resolved, image: resolved[0] || "" });
      } catch (error) {
        list.push({ ...report, images, image: images[0] || "" });
      }
    }
    return list;
  },

  chooseFilter(event) {
    this.applyFilter(event.currentTarget.dataset.filter);
  },

  openDetail(event) {
    const selected = this.data.reports.find((report) => report.id === event.currentTarget.dataset.id);
    if (selected) this.setData({ selectedReport: selected, showDetail: true });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  showReportForm() {
    this.setData({ showForm: true });
  },

  closeReportForm() {
    this.setData({ showForm: false });
  },

  stop() {},

  chooseType() {
    wx.showActionSheet({
      itemList: [PEST_TYPE_DISEASE, PEST_TYPE_INSECT],
      success: (res) => this.setData({ "form.type": res.tapIndex === 0 ? PEST_TYPE_DISEASE : PEST_TYPE_INSECT }),
    });
  },

  chooseSeverity() {
    const values = [SEVERITY_GENERAL, SEVERITY_MODERATE, SEVERITY_URGENT];
    wx.showActionSheet({
      itemList: values,
      success: (res) => this.setData({ "form.severity": values[res.tapIndex] }),
    });
  },

  inputLocation(event) {
    this.setData({
      "form.location": event.detail.value,
      "form.latitude": "",
      "form.longitude": "",
      "form.accuracy": "",
      "form.altitude": "",
      "form.locationSource": "manual",
      locationHint: "\u624b\u5de5\u8f93\u5165\u5730\u70b9\uff0c\u63d0\u4ea4\u65f6\u4e0d\u4f7f\u7528\u65e7\u5b9a\u4f4d\u5750\u6807\u3002",
    });
  },

  ensureLocationPermission(callback) {
    wx.getSetting({
      success: (setting) => {
        if (setting.authSetting["scope.userLocation"]) {
          callback();
          return;
        }
        wx.authorize({
          scope: "scope.userLocation",
          success: callback,
          fail: () => wx.openSetting({
            success: (result) => {
              if (result.authSetting && result.authSetting["scope.userLocation"]) callback();
              else wx.showToast({ title: "\u8bf7\u5f00\u542f\u5b9a\u4f4d\u6743\u9650", icon: "none" });
            },
          }),
        });
      },
      fail: () => wx.showToast({ title: "\u65e0\u6cd5\u8bfb\u53d6\u5b9a\u4f4d\u6743\u9650", icon: "none" }),
    });
  },

  getLocation() {
    if (this.data.locating) return;
    this.ensureLocationPermission(() => {
      this.setData({ locating: true, locationHint: "\u6b63\u5728\u83b7\u53d6\u5f53\u524d\u4f4d\u7f6e\u2026\u2026" });
      wx.getLocation({
        type: "gcj02",
        altitude: true,
        isHighAccuracy: true,
        highAccuracyExpireTime: 5000,
        success: (res) => {
          const latitude = Number(Number(res.latitude).toFixed(6));
          const longitude = Number(Number(res.longitude).toFixed(6));
          const accuracy = Number(res.accuracy || 0);
          const altitude = Number(res.altitude || 0);
          const coordinateText = formatCoordinatePair(latitude, longitude);
          this.setData({
            "form.location": `\u5f53\u524d\u4f4d\u7f6e\uff08${coordinateText}\uff09`,
            "form.latitude": latitude,
            "form.longitude": longitude,
            "form.accuracy": accuracy,
            "form.altitude": altitude,
            "form.locationSource": "gps",
            locationHint: `\u5df2\u5b9a\u4f4d\uff0c\u7cbe\u5ea6\u7ea6 ${accuracy ? `${accuracy.toFixed(1)} \u7c73` : "\u672a\u77e5"}\u3002\u9ed8\u8ba4\u5750\u6807\u683c\u5f0f\uff1a\u5ea6\u5206\u79d2\u3002`,
          });
        },
        fail: (error) => {
          console.error("get pest location failed", error);
          this.setData({ locationHint: "\u5b9a\u4f4d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u624b\u673a\u5b9a\u4f4d\u670d\u52a1\u548c\u5c0f\u7a0b\u5e8f\u6743\u9650\u3002" });
          wx.showToast({ title: "\u5b9a\u4f4d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6743\u9650", icon: "none" });
        },
        complete: () => this.setData({ locating: false }),
      });
    });
  },

  chooseLocation() {
    this.ensureLocationPermission(() => {
      wx.chooseLocation({
        success: (res) => {
          const latitude = Number(res.latitude);
          const longitude = Number(res.longitude);
          const coordinateText = formatCoordinatePair(latitude, longitude);
          this.setData({
            "form.location": res.name || res.address || `\u5730\u56fe\u4f4d\u7f6e\uff08${coordinateText}\uff09`,
            "form.latitude": latitude,
            "form.longitude": longitude,
            "form.accuracy": "",
            "form.altitude": "",
            "form.locationSource": "map",
            locationHint: "\u5df2\u4f7f\u7528\u5730\u56fe\u9009\u70b9\uff0c\u53ef\u7ee7\u7eed\u624b\u52a8\u4fee\u6539\u5730\u70b9\u3002",
          });
        },
        fail: (error) => {
          if (error && error.errMsg && error.errMsg.includes("cancel")) return;
          console.error("choose pest location failed", error);
          wx.showToast({ title: "\u5730\u56fe\u9009\u70b9\u5931\u8d25", icon: "none" });
        },
      });
    });
  },

  inputDescription(event) {
    this.setData({ "form.description": event.detail.value });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.setData({
          "form.image": file.tempFilePath,
          "form.uploadedFileId": "",
          "form.uploadedLocalPath": "",
          pestRecognition: emptyRecognition(),
        });
      },
    });
  },

  removePhoto() {
    this.setData({
      "form.image": "",
      "form.uploadedFileId": "",
      "form.uploadedLocalPath": "",
      pestRecognition: emptyRecognition(),
    });
  },

  async uploadPhoto(filePath) {
    if (!filePath) throw new Error("\u6ca1\u6709\u53ef\u4e0a\u4f20\u7684\u7167\u7247");
    if (filePath.startsWith("cloud://")) return filePath;
    if (this.data.form.uploadedLocalPath === filePath && this.data.form.uploadedFileId) {
      return this.data.form.uploadedFileId;
    }

    let uploadPath = filePath;
    try {
      const compressed = await wx.compressImage({ src: filePath, quality: 30 });
      uploadPath = compressed.tempFilePath || filePath;
    } catch (error) {
      uploadPath = filePath;
    }
    const upload = await uploadCloudFileWithRetry({
      cloudPath: `forest-health/pest-reports/pest-${Date.now()}.jpg`,
      filePath: uploadPath,
    });
    this.setData({ "form.uploadedFileId": upload.fileID, "form.uploadedLocalPath": filePath });
    return upload.fileID;
  },

  async recognizePest() {
    if (!this.data.form.image || this.data.recognizingPest) {
      if (!this.data.form.image) wx.showToast({ title: "\u8bf7\u5148\u6dfb\u52a0\u73b0\u573a\u7167\u7247", icon: "none" });
      return;
    }
    this.setData({ recognizingPest: true });
    wx.showLoading({ title: "\u8bc6\u522b\u75c5\u866b\u5bb3\u4e2d" });
    try {
      const fileID = await this.uploadPhoto(this.data.form.image);
      const result = await treeService.recognizePest(fileID);
      this.setData({ pestRecognition: { ...emptyRecognition(), ...(result.data || {}), visible: true } });
    } catch (error) {
      wx.showModal({
        title: "\u8bc6\u522b\u5931\u8d25",
        content: error.message || "\u6682\u65f6\u65e0\u6cd5\u5b8c\u6210\u75c5\u866b\u5bb3\u8bc6\u522b\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ recognizingPest: false });
    }
  },

  normalizeSeverity(value) {
    const text = String(value || "");
    if (text.includes(SEVERITY_URGENT) || text.includes("\u4e25\u91cd")) return SEVERITY_URGENT;
    if (text.includes(SEVERITY_MODERATE) || text.includes("\u4e2d\u5ea6")) return SEVERITY_MODERATE;
    return SEVERITY_GENERAL;
  },

  applyPestRecognition() {
    const result = this.data.pestRecognition || {};
    const candidate = result.name || (result.candidates && result.candidates[0] && result.candidates[0].name) || "";
    const category = [PEST_TYPE_DISEASE, PEST_TYPE_INSECT].includes(result.category)
      ? result.category
      : this.data.form.type;
    const line = [candidate ? `${category}：${candidate}` : "", result.description || result.reason || ""]
      .filter(Boolean)
      .join("。 ");
    const description = [this.data.form.description, line].filter(Boolean).join("\n");
    this.setData({
      "form.type": category,
      "form.severity": this.normalizeSeverity(result.severity),
      "form.description": description,
      "pestRecognition.visible": false,
    });
    wx.showToast({ title: "\u5df2\u586b\u5165\u4e0a\u62a5\u8868\u5355", icon: "success" });
  },

  copyPestRecognition() {
    const result = this.data.pestRecognition || {};
    const text = [result.category, result.name, result.severity, result.description || result.reason]
      .filter(Boolean)
      .join("\n");
    if (!text) {
      wx.showToast({ title: "\u6ca1\u6709\u53ef\u590d\u5236\u7684\u8bc6\u522b\u7ed3\u679c", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: "\u5df2\u590d\u5236\u8bc6\u522b\u7ed3\u679c", icon: "success" }) });
  },

  async setReportStatus(event) {
    const user = authService.getCachedUser();
    if (!user || user.role !== "admin") {
      wx.showToast({ title: "\u4ec5\u7ba1\u7406\u5458\u53ef\u5904\u7406", icon: "none" });
      return;
    }
    const status = event.currentTarget.dataset.status;
    const report = this.data.selectedReport;
    if (!report || !report.id) return;

    wx.showLoading({ title: "\u5904\u7406\u4e2d" });
    try {
      await pestService.updatePestReportStatus(report.id, status);
      const statusClass = status === STATUS_ACCEPTED
        ? "accepted"
        : status === STATUS_CLOSED
          ? "closed"
          : status === STATUS_REJECTED
            ? "rejected"
            : "pending";
      this.setData({ selectedReport: { ...report, status, statusClass } });
      wx.showToast({ title: "\u5df2\u66f4\u65b0\u72b6\u6001", icon: "success" });
      await this.applyFilter(this.data.activeFilter);
    } catch (error) {
      wx.showModal({ title: "\u5904\u7406\u5931\u8d25", content: error.message || "\u72b6\u6001\u66f4\u65b0\u5931\u8d25\u3002", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },

  async submitReport() {
    const form = this.data.form;
    const validationErrors = validatePestReport({ ...form, images: form.image ? [form.image] : [] });
    if (validationErrors.length) {
      wx.showModal({
        title: "\u8bf7\u5148\u5b8c\u5584\u4e0a\u62a5\u4fe1\u606f",
        content: validationErrors.slice(0, 5).join("\n"),
        showCancel: false,
      });
      return;
    }
    if (this.data.savingReport) return;

    this.setData({ savingReport: true });
    wx.showLoading({ title: "\u63d0\u4ea4\u4e2d" });
    try {
      const fileID = form.uploadedFileId || await this.uploadPhoto(form.image);
      await pestService.savePestReport({
        type: form.type,
        severity: form.severity,
        location: form.location.trim(),
        description: form.description.trim(),
        image: fileID,
        images: [fileID],
        title: `${form.type}：${form.location.trim()}`,
        recognition: this.data.pestRecognition.visible ? this.data.pestRecognition : {},
        latitude: form.latitude,
        longitude: form.longitude,
        accuracy: form.accuracy,
        altitude: form.altitude,
        locationSource: form.locationSource || "manual",
        relatedTreeNo: form.relatedTreeNo || "",
        relatedSpecies: form.relatedSpecies || "",
      });
      this.setData({
        showForm: false,
        form: emptyForm(),
        pestRecognition: emptyRecognition(),
        locating: false,
        locationHint: "",
      });
      wx.showToast({ title: "\u5df2\u63d0\u4ea4\u5ba1\u6838", icon: "success" });
      await this.applyFilter(this.data.activeFilter);
    } catch (error) {
      const content = isUploadNetworkError(error)
        ? "\u7167\u7247\u4e0a\u4f20\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002\u7167\u7247\u5df2\u81ea\u52a8\u538b\u7f29\u5e76\u4f1a\u81ea\u52a8\u91cd\u8bd5\u3002"
        : (error.message || "\u6682\u65f6\u65e0\u6cd5\u63d0\u4ea4\u75c5\u866b\u5bb3\u4e0a\u62a5\u3002");
      wx.showModal({ title: "\u63d0\u4ea4\u5931\u8d25", content, showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ savingReport: false });
    }
  },
});
