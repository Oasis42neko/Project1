const { createEmptyTree, fieldSections } = require("../../models/treeFields");
const treeService = require("../../services/treeService");
const authService = require("../../services/authService");
const { validateTreeRecord } = require("../../utils/validators");
const {
  getPlotCenterLocation,
  getPlotMatchStatus,
  getPlotNos,
  getPlotPolygon,
  getPlotRangeText,
  OUTSIDE_FIXED_PLOT_LABEL,
  parseCoordinateValue,
  formatCoordinateDecimal,
  formatCoordinateDms,
} = require("../../models/plotAreas");

const plotColors = [
  "#FA5151", "#F97316", "#F59E0B", "#84CC16", "#22C55E",
  "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
  "#EF4444", "#FB7185", "#F97316", "#EAB308", "#10B981",
];

const attachFieldValues = (sections, form) => sections.map((section) => ({
  ...section,
  fields: section.fields.map((field) => ({
    ...field,
    value: form[field.key] || "",
    pickerIndex: field.options ? Math.max(0, field.options.indexOf(form[field.key])) : 0,
  })),
}));

const defaultCoordFormat = "dms";
const formatCoordinateForDisplay = (value, coordFormat = defaultCoordFormat) => {
  const formatted = coordFormat === "decimal" ? formatCoordinateDecimal(value) : formatCoordinateDms(value);
  return formatted || (value === undefined || value === null ? "" : String(value));
};
const normalizeFormCoordinates = (form, coordFormat = defaultCoordFormat) => ({
  ...form,
  latitude: formatCoordinateForDisplay(form.latitude, coordFormat),
  longitude: formatCoordinateForDisplay(form.longitude, coordFormat),
});

const defaultSystemSettings = {
  allowManualLocation: true,
};

const defaultMapPreview = {
  latitude: 23.84728034,
  longitude: 116.57898334,
  scale: 11,
  markers: [],
  polygons: [],
  hasLocation: false,
};

const defaultPlotStatus = {
  visible: false,
  className: "neutral",
  title: "",
  desc: "",
  rangeText: "",
  actionVisible: false,
};

const colorWithAlpha = (hex, alpha) => `${hex}${alpha}`;

const buildPlotCenters = () => getPlotNos().map((plotNo, index) => {
  const center = getPlotCenterLocation(plotNo);
  if (!center) return null;
  return {
    plotNo,
    index,
    latitude: Number(center.latitude),
    longitude: Number(center.longitude),
    altitude: center.altitude,
  };
}).filter(Boolean);

const buildMapPreview = (form) => {
  const plotCenters = buildPlotCenters();
  if (!plotCenters.length) return defaultMapPreview;

  const latitudes = plotCenters.map((item) => item.latitude);
  const longitudes = plotCenters.map((item) => item.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitude = Number(((minLatitude + maxLatitude) / 2).toFixed(8));
  const longitude = Number(((minLongitude + maxLongitude) / 2).toFixed(8));
  const span = Math.max(maxLatitude - minLatitude, maxLongitude - minLongitude);

  let scale = 11;
  if (span < 0.01) scale = 14;
  else if (span < 0.02) scale = 13;
  else if (span < 0.03) scale = 12;
  else if (span < 0.05) scale = 11;
  else scale = 10;

  const selectedPlotNo = form.plotNo;
  const manualLatitude = parseCoordinateValue(form.latitude);
  const manualLongitude = parseCoordinateValue(form.longitude);
  const manualLocationVisible = Number.isFinite(manualLatitude) && Number.isFinite(manualLongitude);

  const markers = plotCenters.map((plot, index) => {
    const selected = plot.plotNo === selectedPlotNo;
    const color = selected ? "#1677FF" : plotColors[index % plotColors.length];
    return {
      id: index + 1,
      latitude: plot.latitude,
      longitude: plot.longitude,
      width: selected ? 36 : 28,
      height: selected ? 36 : 28,
      callout: {
        content: plot.plotNo,
        color: "#FFFFFF",
        fontSize: 12,
        borderRadius: 16,
        bgColor: colorWithAlpha(color, "DD"),
        padding: 8,
        display: "BYCLICK",
      },
    };
  });

  if (manualLocationVisible) {
    markers.push({
      id: 9000,
      latitude: manualLatitude,
      longitude: manualLongitude,
      width: 26,
      height: 26,
      callout: {
        content: "当前填写位置",
        color: "#FFFFFF",
        fontSize: 11,
        borderRadius: 12,
        bgColor: "#1D7A4D",
        padding: 6,
        display: "ALWAYS",
      },
    });
  }

  const polygons = getPlotNos().map((plotNo, index) => {
    const selected = plotNo === selectedPlotNo;
    const color = selected ? "#1677FF" : plotColors[index % plotColors.length];
    return {
      points: getPlotPolygon(plotNo),
      strokeWidth: selected ? 3 : 2,
      strokeColor: colorWithAlpha(color, "CC"),
      fillColor: colorWithAlpha(color, selected ? "44" : "22"),
    };
  });

  return {
    latitude,
    longitude,
    scale,
    markers,
    polygons,
    hasLocation: true,
  };
};

const buildPlotStatus = (form, systemSettings) => {
  if (!form.plotNo) return defaultPlotStatus;
  if (form.plotNo === OUTSIDE_FIXED_PLOT_LABEL) {
    return {
      visible: true,
      className: "warning",
      title: OUTSIDE_FIXED_PLOT_LABEL,
      desc: form.latitude && form.longitude
        ? "该记录不受固定样方 20m × 20m 范围校验，请确认定位坐标准确。"
        : "该区域不属于固定样方，请填写实际定位坐标后保存。",
      rangeText: "",
      actionVisible: false,
    };
  }
  const matchStatus = getPlotMatchStatus(form.plotNo, form.latitude, form.longitude);
  const rangeText = getPlotRangeText(form.plotNo);
  const allowAction = !!(systemSettings && systemSettings.allowManualLocation);

  if (matchStatus.state === "matched") {
    return {
      visible: true,
      className: "neutral",
      title: `${form.plotNo} 坐标已匹配`,
      desc: "当前经纬度已落在该样方范围内。",
      rangeText,
      actionVisible: false,
    };
  }
  if (matchStatus.state === "noLocation") {
    return {
      visible: true,
      className: "warning",
      title: `${form.plotNo} 已选中`,
      desc: "还没有填写经纬度，点击“填入样方中心”可自动回填。",
      rangeText,
      actionVisible: allowAction,
    };
  }
  if (matchStatus.state === "mismatch") {
    return {
      visible: true,
      className: "error",
      title: `${form.plotNo} 坐标不在样方范围内`,
      desc: "可以核对录入值，或直接回填样方中心。",
      rangeText,
      actionVisible: allowAction,
    };
  }
  if (matchStatus.state === "missingArea") {
    return {
      visible: true,
      className: "error",
      title: "样方不存在",
      desc: "请先重新选择样地编号。",
      rangeText: "",
      actionVisible: false,
    };
  }
  return defaultPlotStatus;
};

const buildImagePreviews = (images = []) => images.map((src, index) => ({
  src,
  preview: src,
  index,
}));

Page({
  data: {
    id: "",
    form: createEmptyTree(),
    sections: attachFieldValues(fieldSections, createEmptyTree()),
    saving: false,
    coordFormat: defaultCoordFormat,
    systemSettings: defaultSystemSettings,
    mapPreview: defaultMapPreview,
    plotStatus: defaultPlotStatus,
    imagePreviews: [],
  },

  onLoad(query) {
    if (!authService.requireLogin()) return;
    const defaults = wx.getStorageSync("forestFormDefaults") || {};
    this.setData({
      form: {
        ...this.data.form,
        plotNo: defaults.plotNo || this.data.form.plotNo,
        recorder: defaults.recorder || this.data.form.recorder,
      },
    }, () => {
      this.refreshSections();
      this.refreshDerivedState();
      this.autoFillSelectedPlotCenter({ force: false });
    });
    this.loadSystemSettings();
    if (query.id) {
      this.setData({ id: query.id });
      this.loadRecord(query.id);
    }
  },

  async loadSystemSettings() {
    try {
      const res = await treeService.getSystemSettings();
      this.setData({
        systemSettings: {
          allowManualLocation: res.data ? res.data.allowManualLocation !== false : true,
        },
      }, () => this.refreshDerivedState());
    } catch (error) {
      this.setData({ systemSettings: defaultSystemSettings }, () => this.refreshDerivedState());
    }
  },

  async loadRecord(id) {
    wx.showLoading({ title: "加载中" });
    try {
      const res = await treeService.getTree(id);
      this.setData({ form: normalizeFormCoordinates({ ...createEmptyTree(), ...(res.data || {}) }, this.data.coordFormat) });
      this.refreshSections();
      this.refreshDerivedState();
      this.autoFillSelectedPlotCenter({ force: false });
    } catch (error) {
      wx.showToast({ title: "档案加载失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  refreshSections() {
    this.setData({ sections: attachFieldValues(fieldSections, this.data.form) });
  },

  refreshDerivedState() {
    this.setData({
      imagePreviews: buildImagePreviews(this.data.form.images || []),
      mapPreview: buildMapPreview(this.data.form),
      plotStatus: buildPlotStatus(this.data.form, this.data.systemSettings),
    });
  },

  updateValue(key, value) {
    const patch = { [`form.${key}`]: value };
    if (key === "plotNo" && value === OUTSIDE_FIXED_PLOT_LABEL) {
      patch["form.latitude"] = "";
      patch["form.longitude"] = "";
      patch["form.altitude"] = "";
      patch["form.locationSource"] = "manual";
    }
    this.setData(patch, () => {
      this.refreshSections();
      this.refreshDerivedState();
      if (key === "plotNo") {
        this.autoFillSelectedPlotCenter({ force: true });
      }
    });
  },

  onInput(event) {
    this.updateValue(event.currentTarget.dataset.key, event.detail.value);
  },

  onLocationInput(event) {
    this.updateValue(event.currentTarget.dataset.key, event.detail.value);
  },

  onPickerChange(event) {
    const { sectionIndex, fieldIndex } = event.currentTarget.dataset;
    const field = this.data.sections[Number(sectionIndex)].fields[Number(fieldIndex)];
    this.updateValue(field.key, field.options[Number(event.detail.value)]);
  },

  onDateChange(event) {
    this.updateValue(event.currentTarget.dataset.key, event.detail.value);
  },

  changeCoordFormat(event) {
    const nextFormat = event.currentTarget.dataset.format === "decimal" ? "decimal" : "dms";
    if (nextFormat === this.data.coordFormat) return;
    this.setData({
      coordFormat: nextFormat,
      form: normalizeFormCoordinates(this.data.form, nextFormat),
    }, () => {
      this.refreshSections();
      this.refreshDerivedState();
    });
  },

  autoFillSelectedPlotCenter({ force = false } = {}) {
    const center = getPlotCenterLocation(this.data.form.plotNo);
    if (!center) return;
    if (!force && this.data.form.latitude && this.data.form.longitude) return;
    this.setData({
      "form.latitude": formatCoordinateForDisplay(center.latitude, this.data.coordFormat),
      "form.longitude": formatCoordinateForDisplay(center.longitude, this.data.coordFormat),
      "form.altitude": center.altitude !== undefined && center.altitude !== null && center.altitude !== ""
        ? Number(center.altitude).toFixed(1)
        : this.data.form.altitude,
    }, () => {
      this.refreshSections();
      this.refreshDerivedState();
    });
  },

  applyLocation(location) {
    this.setData({
      "form.latitude": formatCoordinateForDisplay(location.latitude, this.data.coordFormat),
      "form.longitude": formatCoordinateForDisplay(location.longitude, this.data.coordFormat),
      "form.altitude": location.altitude !== undefined && location.altitude !== null && location.altitude !== "" ? Number(location.altitude).toFixed(1) : this.data.form.altitude,
    }, () => {
      this.refreshSections();
      this.refreshDerivedState();
    });
  },

  getLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.applyLocation(res);
        treeService.logOperation("location_gps", {
          title: "自动定位",
          summary: "树木档案录入使用自动定位",
          targetType: "treeForm",
          details: { latitude: res.latitude, longitude: res.longitude },
        }).catch(() => {});
        wx.showToast({ title: "已获取定位" });
      },
      fail: () => {
        wx.showToast({ title: "定位失败，请检查授权", icon: "none" });
      },
    });
  },

  chooseLocation() {
    wx.chooseLocation({
      latitude: this.data.form.latitude ? parseCoordinateValue(this.data.form.latitude) : undefined,
      longitude: this.data.form.longitude ? parseCoordinateValue(this.data.form.longitude) : undefined,
      success: (res) => {
        this.applyLocation(res);
        treeService.logOperation("location_select", {
          title: "地图选点",
          summary: res.name || res.address || "树木档案录入地图选点",
          targetType: "treeForm",
          details: { latitude: res.latitude, longitude: res.longitude },
        }).catch(() => {});
        const remark = this.data.form.remark || "";
        const locationText = res.name || res.address;
        if (locationText && !remark.includes(locationText)) {
          this.setData({ "form.remark": remark ? `${remark}\n位置：${locationText}` : `位置：${locationText}` }, () => this.refreshSections());
        }
      },
      fail: () => wx.showToast({ title: "未选择位置", icon: "none" }),
    });
  },

  openMapPreview() {
    wx.switchTab({ url: "/pages/map/index" });
  },

  applyPlotCenter() {
    const center = getPlotCenterLocation(this.data.form.plotNo);
    if (!center) {
      wx.showToast({ title: "请先选择样方", icon: "none" });
      return;
    }
    this.setData({
      "form.latitude": formatCoordinateForDisplay(center.latitude, this.data.coordFormat),
      "form.longitude": formatCoordinateForDisplay(center.longitude, this.data.coordFormat),
      "form.altitude": center.altitude !== undefined && center.altitude !== null && center.altitude !== ""
        ? Number(center.altitude).toFixed(1)
        : this.data.form.altitude,
    }, () => {
      this.refreshSections();
      this.refreshDerivedState();
      treeService.logOperation("location_plot_center", {
        title: "填入样方中心",
        summary: this.data.form.plotNo || "样方中心坐标",
        targetType: "plot",
        targetId: this.data.form.plotNo || "",
        details: { latitude: center.latitude, longitude: center.longitude },
      }).catch(() => {});
      wx.showToast({ title: "已填入样方中心" });
    });
  },

  chooseImages() {
    wx.chooseImage({
      count: 3,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success: async (res) => {
        const images = [...(this.data.form.images || []), ...res.tempFilePaths].slice(0, 6);
        this.setData({ "form.images": images }, () => this.refreshDerivedState());
      },
    });
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index;
    const images = [...(this.data.form.images || [])];
    images.splice(index, 1);
    this.setData({ "form.images": images }, () => this.refreshDerivedState());
  },


  async uploadImages(record) {
    const images = record.images || [];
    const uploaded = [];
    for (let index = 0; index < images.length; index += 1) {
      const path = images[index];
      if (!path || path.startsWith("cloud://")) {
        uploaded.push(path);
        continue;
      }
      const safeTreeNo = String(record.treeNo || "tree").replace(/[^a-zA-Z0-9_-]/g, "_");
      const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".jpg";
      const upload = await wx.cloud.uploadFile({
        cloudPath: `forest-health/photos/${safeTreeNo}-${Date.now()}-${index}${ext}`,
        filePath: path,
      });
      uploaded.push(upload.fileID);
    }
    return { ...record, images: uploaded };
  },

  async submitForm() {
    const errors = validateTreeRecord(this.data.form);
    if (errors.length) {
      wx.showModal({
        title: "请修正数据",
        content: errors.slice(0, 4).join("\n"),
        showCancel: false,
      });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中" });
    try {
      let record = { ...this.data.form };
      record = await this.uploadImages(record);
      if (this.data.id) record._id = this.data.id;
      const res = await treeService.saveTree(record);
      wx.setStorageSync("forestFormDefaults", {
        plotNo: record.plotNo,
        recorder: record.recorder,
      });
      this.setData({ id: res.data._id });
      wx.showToast({ title: "已保存" });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/record/index" }) }), 500);
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
});
