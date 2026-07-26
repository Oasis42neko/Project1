const { createEmptyTree, fieldSections } = require("../../models/treeFields");
const treeService = require("../../services/treeService");
const authService = require("../../services/authService");
const { validateTreeRecord } = require("../../utils/validators");

const attachFieldValues = (sections, form) => sections.map((section) => ({
  ...section,
  fields: section.fields.map((field) => ({
    ...field,
    value: form[field.key] || "",
    pickerIndex: field.options ? Math.max(0, field.options.indexOf(form[field.key])) : 0,
  })),
}));

Page({
  data: {
    id: "",
    form: createEmptyTree(),
    sections: attachFieldValues(fieldSections, createEmptyTree()),
    saving: false,
  },

  onLoad(query) {
    if (!authService.requireLogin()) return;
    if (query.id) {
      this.setData({ id: query.id });
      this.loadRecord(query.id);
    } else {
      const defaults = wx.getStorageSync("forestFormDefaults") || {};
      this.setData({
        form: {
          ...this.data.form,
          plotNo: defaults.plotNo || this.data.form.plotNo,
          recorder: defaults.recorder || this.data.form.recorder,
        },
      });
      this.refreshSections();
    }
  },

  async loadRecord(id) {
    wx.showLoading({ title: "加载中" });
    try {
      const res = await treeService.getTree(id);
      this.setData({ form: { ...createEmptyTree(), ...(res.data || {}) } });
      this.refreshSections();
    } catch (error) {
      wx.showToast({ title: "档案加载失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  refreshSections() {
    this.setData({ sections: attachFieldValues(fieldSections, this.data.form) });
  },

  updateValue(key, value) {
    this.setData({ [`form.${key}`]: value }, () => this.refreshSections());
  },

  onInput(event) {
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

  applyLocation(location) {
    this.setData({
      "form.latitude": Number(location.latitude).toFixed(6),
      "form.longitude": Number(location.longitude).toFixed(6),
      "form.altitude": location.altitude ? Number(location.altitude).toFixed(1) : this.data.form.altitude,
    }, () => this.refreshSections());
  },

  getLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.applyLocation(res);
        wx.showToast({ title: "已获取定位" });
      },
      fail: () => {
        wx.showToast({ title: "定位失败，请检查授权", icon: "none" });
      },
    });
  },

  chooseLocation() {
    wx.chooseLocation({
      latitude: this.data.form.latitude ? Number(this.data.form.latitude) : undefined,
      longitude: this.data.form.longitude ? Number(this.data.form.longitude) : undefined,
      success: (res) => {
        this.applyLocation(res);
        const remark = this.data.form.remark || "";
        const locationText = res.name || res.address;
        if (locationText && !remark.includes(locationText)) {
          this.setData({ "form.remark": remark ? `${remark}
位置：${locationText}` : `位置：${locationText}` }, () => this.refreshSections());
        }
      },
      fail: () => wx.showToast({ title: "未选择位置", icon: "none" }),
    });
  },

  chooseImages() {
    wx.chooseImage({
      count: 3,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success: async (res) => {
        const images = [...(this.data.form.images || []), ...res.tempFilePaths].slice(0, 6);
        this.setData({ "form.images": images });
      },
    });
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index;
    const images = [...(this.data.form.images || [])];
    images.splice(index, 1);
    this.setData({ "form.images": images });
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
