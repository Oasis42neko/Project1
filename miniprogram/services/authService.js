const AUTH_STORAGE_KEY = "forestAuthUser";

const callForestFunction = (type, data = {}) => wx.cloud.callFunction({
  name: "quickstartFunctions",
  data: {
    type,
    ...data,
  },
}).then((res) => res.result || {});

const getCachedUser = () => {
  const user = wx.getStorageSync(AUTH_STORAGE_KEY);
  return user && user.openid ? user : null;
};

const setCachedUser = (user) => {
  wx.setStorageSync(AUTH_STORAGE_KEY, user);
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.user = user;
    if (typeof app.startLocationSharing === "function") {
      app.startLocationSharing();
    }
  }
};

const clearCachedUser = () => {
  wx.removeStorageSync(AUTH_STORAGE_KEY);
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.user = null;
  }
};

const login = async (profile = {}) => {
  const result = await callForestFunction("loginUser", { profile });
  if (!result.success || !result.data || !result.data.openid) {
    throw new Error(result.errMsg || "登录失败");
  }
  setCachedUser(result.data);
  return result.data;
};

const requireLogin = () => {
  const user = getCachedUser();
  if (user) return user;
  wx.reLaunch({ url: "/pages/login/index" });
  return null;
};

module.exports = {
  clearCachedUser,
  getCachedUser,
  login,
  requireLogin,
  setCachedUser,
};
