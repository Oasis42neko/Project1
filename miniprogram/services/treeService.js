const callForestFunction = (type, data = {}) => wx.cloud.callFunction({
  name: "quickstartFunctions",
  data: {
    type,
    ...data,
  },
}).then((res) => {
  const result = res.result || {};
  if (result.success === false) {
    throw new Error(result.errMsg || `${type} 调用失败`);
  }
  return result;
});

const initProject = () => callForestFunction("initForestProject");
const listTrees = (params) => callForestFunction("listTrees", params);
const getTree = (id) => callForestFunction("getTree", { id });
const saveTree = (record) => callForestFunction("saveTree", { record });
const deleteTree = (id) => callForestFunction("deleteTree", { id });
const getStats = () => callForestFunction("statsTrees");
const exportTrees = () => callForestFunction("exportTrees");
const seedDemoData = () => callForestFunction("seedDemoData");
const listUsers = () => callForestFunction("listUsers");
const updateUserRole = (userId, role) => callForestFunction("updateUserRole", { userId, role });
const getSystemSettings = () => callForestFunction("getSystemSettings");
const updateSystemSettings = (settings) => callForestFunction("updateSystemSettings", settings);
const updateMyLocation = (location) => callForestFunction("updateMyLocation", location);
const setMyLocationOffline = () => callForestFunction("setMyLocationOffline");
const listUserLocations = () => callForestFunction("listUserLocations");
const recognizePlant = (fileID) => callForestFunction("recognizePlant", { fileID });
const recognizePest = (fileID) => callForestFunction("recognizePest", { fileID });

module.exports = {
  deleteTree,
  exportTrees,
  getStats,
  getSystemSettings,
  getTree,
  initProject,
  listTrees,
  listUserLocations,
  recognizePlant,
  recognizePest,
  saveTree,
  seedDemoData,
  setMyLocationOffline,
  listUsers,
  updateMyLocation,
  updateSystemSettings,
  updateUserRole,
};
