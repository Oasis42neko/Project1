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
const listAncientTrees = (params) => callForestFunction("listAncientTrees", params);
const getAncientTree = (id) => callForestFunction("getAncientTree", { id });
const importAncientTrees = (params) => callForestFunction("importAncientTrees", params);
const listKnowledgeFiles = (params) => callForestFunction("listKnowledgeFiles", params);
const saveKnowledgeFile = (file) => callForestFunction("saveKnowledgeFile", { file });
const deleteKnowledgeFile = (id) => callForestFunction("deleteKnowledgeFile", { id });
const getTree = (id) => callForestFunction("getTree", { id });
const saveTree = (record) => callForestFunction("saveTree", { record });
const deleteTree = (id) => callForestFunction("deleteTree", { id });
const getStats = () => callForestFunction("statsTrees");
const exportTrees = () => callForestFunction("exportTrees");
const listUsers = () => callForestFunction("listUsers");
const updateUserRole = (userId, role) => callForestFunction("updateUserRole", { userId, role });
const getSystemSettings = () => callForestFunction("getSystemSettings");
const updateSystemSettings = (settings) => callForestFunction("updateSystemSettings", settings);
const updateMyLocation = (location) => callForestFunction("updateMyLocation", location);
const setMyLocationOffline = () => callForestFunction("setMyLocationOffline");
const listUserLocations = () => callForestFunction("listUserLocations");
const logOperation = (action, details = {}) => callForestFunction("logOperation", {
  action,
  title: details.title || action,
  summary: details.summary || "",
  targetType: details.targetType || "",
  targetId: details.targetId || "",
  details: details.details || {},
});
const saveAncientIssue = (issue) => callForestFunction("saveAncientIssue", { issue });
const listAdminMessages = (params) => callForestFunction("listAdminMessages", params);
const exportAdminMessages = (messageType) => callForestFunction("exportAdminMessages", { messageType });

module.exports = {
  deleteTree,
  exportTrees,
  getStats,
  getSystemSettings,
  getTree,
  getAncientTree,
  importAncientTrees,
  initProject,
  listKnowledgeFiles,
  listAncientTrees,
  listTrees,
  listUserLocations,
  logOperation,
  saveAncientIssue,
  listAdminMessages,
  exportAdminMessages,
  saveTree,
  saveKnowledgeFile,
  deleteKnowledgeFile,
  setMyLocationOffline,
  listUsers,
  updateMyLocation,
  updateSystemSettings,
  updateUserRole,
};
