const authService = require("../../services/authService");
const treeService = require("../../services/treeService");
const { getPlotCenterLocation, getPlotNos, formatCoordinateDms } = require("../../models/plotAreas");

const defaultPlotCenter = getPlotCenterLocation(getPlotNos()[0]) || {
  latitude: 23.84728034,
  longitude: 116.57898334,
};

const roleLabel = {
  admin: "\u7ba1\u7406\u5458",
  recorder: "\u666e\u901a\u7528\u6237",
};

const formatTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
};

Page({
  data: {
    loading: false,
    users: [],
    currentOpenid: "",
    settings: {
      allowManualLocation: true,
    },
    userLocations: [],
    locationMarkers: [],
    locationMap: {
      latitude: defaultPlotCenter.latitude,
      longitude: defaultPlotCenter.longitude,
      scale: 13,
    },
  },

  onLoad() {
    const user = authService.requireLogin();
    if (!user) return;
    if (user.role !== "admin") {
      wx.showModal({
        title: "\u65e0\u6743\u9650",
        content: "\u4ec5\u7ba1\u7406\u5458\u53ef\u4ee5\u8fdb\u5165\u7528\u6237\u7ba1\u7406\u3002",
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    this.loadDashboard();
    this.locationTimer = setInterval(() => this.loadLocations(), 30000);
  },

  onUnload() {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },

  formatUsers(users) {
    return users.map((user) => ({
      ...user,
      roleText: roleLabel[user.role] || "\u666e\u901a\u7528\u6237",
      openidShort: user.openid ? `${user.openid.slice(0, 6)}...${user.openid.slice(-6)}` : "-",
      actionText: user.role === "admin" ? "\u8bbe\u4e3a\u666e\u901a" : "\u8bbe\u4e3a\u7ba1\u7406\u5458",
      nextRole: user.role === "admin" ? "recorder" : "admin",
    }));
  },

  formatLocations(locations) {
    const list = locations
      .filter((item) => item.latitude !== undefined && item.longitude !== undefined)
      .map((item, index) => {
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        const name = item.nickName || (item.openid ? `${item.openid.slice(0, 6)}...${item.openid.slice(-6)}` : `\u6210\u5458${index + 1}`);
        return {
          ...item,
          latitude,
          longitude,
          name,
          statusText: item.isOnline ? "\u5728\u7ebf" : "\u79bb\u7ebf",
          roleText: roleLabel[item.role] || "\u666e\u901a\u7528\u6237",
          coordText: `${formatCoordinateDms(latitude)}, ${formatCoordinateDms(longitude)}`,
          accuracyText: item.accuracy ? `\u7cbe\u5ea6 ${item.accuracy}m` : "",
          updatedText: formatTime(item.updatedAt),
        };
      });
    const markers = list.map((item, index) => ({
      id: index + 1,
      latitude: item.latitude,
      longitude: item.longitude,
      width: item.isOnline ? 28 : 22,
      height: item.isOnline ? 28 : 22,
      callout: {
        content: `${item.name} ${item.statusText}`,
        display: "ALWAYS",
        bgColor: "#FFFFFF",
        color: item.isOnline ? "#1D7A4D" : "#666666",
        borderRadius: 6,
        padding: 6,
      },
    }));
    const firstOnline = list.find((item) => item.isOnline) || list[0];
    return {
      list,
      markers,
      map: firstOnline ? {
        latitude: firstOnline.latitude,
        longitude: firstOnline.longitude,
        scale: 15,
      } : this.data.locationMap,
    };
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      await Promise.all([this.loadUsers(), this.loadSettings(), this.loadLocations()]);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadUsers() {
    try {
      const res = await treeService.listUsers();
      const payload = res.data || {};
      this.setData({
        users: this.formatUsers(payload.users || []),
        currentOpenid: payload.currentOpenid || "",
      });
    } catch (error) {
      wx.showModal({
        title: "\u52a0\u8f7d\u5931\u8d25",
        content: error.message || "\u8bf7\u786e\u8ba4\u5f53\u524d\u7528\u6237\u4e3a\u7ba1\u7406\u5458\uff0c\u5e76\u5df2\u90e8\u7f72\u4e91\u51fd\u6570\u3002",
        showCancel: false,
      });
    }
  },

  async loadSettings() {
    const res = await treeService.getSystemSettings();
    this.setData({ settings: { allowManualLocation: res.data ? res.data.allowManualLocation !== false : true } });
  },

  async loadLocations() {
    const res = await treeService.listUserLocations();
    const formatted = this.formatLocations((res.data && res.data.locations) || []);
    this.setData({
      userLocations: formatted.list,
      locationMarkers: formatted.markers,
      locationMap: formatted.map,
    });
  },

  async toggleManualLocation(event) {
    const allowManualLocation = !!event.detail.value;
    this.setData({ "settings.allowManualLocation": allowManualLocation });
    wx.showLoading({ title: "\u4fdd\u5b58\u4e2d" });
    try {
      await treeService.updateSystemSettings({ allowManualLocation });
      wx.showToast({ title: "\u5df2\u66f4\u65b0" });
    } catch (error) {
      this.setData({ "settings.allowManualLocation": !allowManualLocation });
      wx.showToast({ title: "\u4fdd\u5b58\u5931\u8d25", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  changeRole(event) {
    const { id, role, name } = event.currentTarget.dataset;
    wx.showModal({
      title: "\u8c03\u6574\u6743\u9650",
      content: `\u786e\u8ba4\u5c06 ${name || "\u8be5\u7528\u6237"} \u8c03\u6574\u4e3a${roleLabel[role]}\u5417\uff1f`,
      confirmColor: "#07C160",
      success: async (modal) => {
        if (!modal.confirm) return;
        wx.showLoading({ title: "\u4fdd\u5b58\u4e2d" });
        try {
          await treeService.updateUserRole(id, role);
          wx.showToast({ title: "\u5df2\u66f4\u65b0" });
          this.loadUsers();
        } catch (error) {
          wx.showModal({
            title: "\u66f4\u65b0\u5931\u8d25",
            content: error.message || "\u8bf7\u7a0d\u540e\u91cd\u8bd5",
            showCancel: false,
          });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});

