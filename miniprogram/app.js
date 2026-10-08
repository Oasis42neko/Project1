const treeService = require("./services/treeService");

const CLOUD_ENV_ID = "cloud1-d6gur693n29df504b";

App({
  globalData: {
    env: CLOUD_ENV_ID,
    user: null,
    locationTimer: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 及以上基础库以支持云能力");
      return;
    }

    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true,
    });

    const cachedUser = wx.getStorageSync("forestAuthUser");
    if (cachedUser && cachedUser.openid) {
      this.globalData.user = cachedUser;
    }
  },

  onShow() {
    this.startLocationSharing();
  },

  onHide() {
    this.stopLocationSharing(true);
  },

  startLocationSharing() {
    if (!this.globalData.user || !this.globalData.user.openid) return;
    if (this.globalData.locationTimer) return;
    this.reportMyLocation();
    this.globalData.locationTimer = setInterval(() => this.reportMyLocation(), 30000);
  },

  stopLocationSharing(markOffline = false) {
    if (this.globalData.locationTimer) {
      clearInterval(this.globalData.locationTimer);
      this.globalData.locationTimer = null;
    }
    if (markOffline && this.globalData.user && this.globalData.user.openid) {
      treeService.setMyLocationOffline().catch(() => {});
    }
  },

  reportMyLocation() {
    if (!this.globalData.user || !this.globalData.user.openid) return;
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        treeService.updateMyLocation({
          latitude: res.latitude,
          longitude: res.longitude,
          altitude: res.altitude || "",
          accuracy: res.accuracy || "",
          source: "app",
        }).catch(() => {});
      },
      fail: () => {},
    });
  },
});
