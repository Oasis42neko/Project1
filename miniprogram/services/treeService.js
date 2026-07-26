const callForestFunction = (type, data = {}) => wx.cloud.callFunction({
  name: "quickstartFunctions",
  data: {
    type,
    ...data,
  },
}).then((res) => res.result || {});

const initProject = () => callForestFunction("initForestProject");
const listTrees = (params) => callForestFunction("listTrees", params);
const getTree = (id) => callForestFunction("getTree", { id });
const saveTree = (record) => callForestFunction("saveTree", { record });
const deleteTree = (id) => callForestFunction("deleteTree", { id });
const getStats = () => callForestFunction("statsTrees");
const exportTrees = () => callForestFunction("exportTrees");

module.exports = {
  deleteTree,
  exportTrees,
  getStats,
  getTree,
  initProject,
  listTrees,
  saveTree,
};
