App({
  globalData: {
    env: "",
    user: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上基础库以使用云能力");
      return;
    }

    const cloudConfig = {
      traceUser: true,
    };
    if (this.globalData.env) {
      cloudConfig.env = this.globalData.env;
    }
    wx.cloud.init(cloudConfig);

    const cachedUser = wx.getStorageSync("forestAuthUser");
    if (cachedUser && cachedUser.openid) {
      this.globalData.user = cachedUser;
    }
  },
});
