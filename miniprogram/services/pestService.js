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

const listPestReports = (params = {}) => callForestFunction("listPestReports", params);
const savePestReport = (report) => callForestFunction("savePestReport", { report });
const updatePestReportStatus = (id, status) => callForestFunction("updatePestReportStatus", { id, status });

module.exports = {
  listPestReports,
  savePestReport,
  updatePestReportStatus,
};