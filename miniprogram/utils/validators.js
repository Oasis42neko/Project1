const { fieldLabels, fieldSections } = require("../models/treeFields");
const { getPlotMatchStatus, getPlotNos, OUTSIDE_FIXED_PLOT_LABEL, parseCoordinateValue } = require("../models/plotAreas");

const numberFields = fieldSections
  .flatMap((section) => section.fields)
  .filter((field) => field.type === "number" || field.type === "digit");

const requiredFields = fieldSections
  .flatMap((section) => section.fields)
  .filter((field) => field.required)
  .map((field) => field.key)
  .concat(["latitude", "longitude", "altitude"]);

const locationNumberFields = [
  { key: "latitude", label: "\u7eac\u5ea6", min: -90, max: 90 },
  { key: "longitude", label: "\u7ecf\u5ea6", min: -180, max: 180 },
  { key: "altitude", label: "\u6d77\u62d4", min: 0, max: 3000 },
];

const treeNoPattern = /^(?:FH-\d{2}|\u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df)-\d{2,3}$/;
const plotNoPattern = /^(?:FH-\d{2}|\u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df)$/;
const validPlotNos = new Set([...getPlotNos(), OUTSIDE_FIXED_PLOT_LABEL]);
const severeLevels = new Set(["\u4e25\u91cd"]);

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === "";

const parseRecordNumber = (key, value) => (key === "latitude" || key === "longitude" ? parseCoordinateValue(value) : Number(value));

const todayKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const validateTreeRecord = (record, settings = {}) => {
  const errors = [];

  requiredFields.forEach((key) => {
    if (isEmpty(record[key])) {
      errors.push(`${fieldLabels[key]}\u4e0d\u80fd\u4e3a\u7a7a`);
    }
  });

  numberFields.forEach((field) => {
    const value = record[field.key];
    if (isEmpty(value)) return;
    const numberValue = parseRecordNumber(field.key, value);
    if (Number.isNaN(numberValue)) {
      errors.push(`${field.label}\u5fc5\u987b\u662f\u6570\u5b57`);
      return;
    }
    if (field.min !== undefined && numberValue < field.min) {
      errors.push(`${field.label}\u4e0d\u80fd\u5c0f\u4e8e${field.min}`);
    }
    if (field.max !== undefined && numberValue > field.max) {
      errors.push(`${field.label}\u4e0d\u80fd\u5927\u4e8e${field.max}`);
    }
  });

  if (!Array.isArray(record.images) || record.images.length === 0) {
    errors.push("\u73b0\u573a\u7167\u7247\u4e0d\u80fd\u4e3a\u7a7a");
  }

  locationNumberFields.forEach((field) => {
    const value = record[field.key];
    if (isEmpty(value)) return;
    const numberValue = parseRecordNumber(field.key, value);
    if (Number.isNaN(numberValue)) {
      errors.push(`${field.label}\u5fc5\u987b\u662f\u6570\u5b57`);
      return;
    }
    if (numberValue < field.min || numberValue > field.max) {
      errors.push(`${field.label}\u8303\u56f4\u5e94\u5728 ${field.min} \u5230 ${field.max} \u4e4b\u95f4`);
    }
  });

  if (!isEmpty(record.recordDate) && String(record.recordDate) > todayKey()) {
    errors.push("\u8c03\u67e5\u65e5\u671f\u4e0d\u80fd\u665a\u4e8e\u4eca\u5929");
  }

  if (!isEmpty(record.plotNo)) {
    const plotNo = String(record.plotNo);
    if (!plotNoPattern.test(plotNo)) {
      errors.push("\u89c2\u6d4b\u6837\u65b9\u683c\u5f0f\u5e94\u4e3a FH-01");
    } else if (!validPlotNos.has(plotNo)) {
      errors.push("\u89c2\u6d4b\u6837\u65b9\u4e0d\u5728\u5f53\u524d\u6837\u5730\u914d\u7f6e\u4e2d");
    }
  }
  if (!isEmpty(record.treeNo) && !treeNoPattern.test(String(record.treeNo))) {
    errors.push("\u6837\u6728\u7f16\u53f7\u683c\u5e94\u4e3a FH-01-01 \u6216 \u56fa\u5b9a\u6837\u65b9\u4ee5\u5916\u533a\u57df-01");
  }
  if (!isEmpty(record.plotNo) && !isEmpty(record.treeNo) && !String(record.treeNo).startsWith(`${String(record.plotNo)}-`)) {
    errors.push("\u6837\u6811\u7f16\u53f7\u5e94\u4e0e\u89c2\u6d4b\u6837\u65b9\u4e00\u81f4");
  }

  if (String(record.plotNo) !== OUTSIDE_FIXED_PLOT_LABEL) {
    const plotMatch = getPlotMatchStatus(record.plotNo, record.latitude, record.longitude);
    if (plotMatch.state === "missingArea") {
      errors.push("\u6240\u9009\u6837\u65b9\u6682\u672a\u914d\u7f6e\u7ecf\u7eac\u5ea6\u8303\u56f4");
    }
    if (plotMatch.state === "mismatch") {
      errors.push("\u5b9a\u4f4d\u4e0d\u5339\u914d\uff1a\u5f53\u524d\u5750\u6807\u4e0d\u5728\u6240\u9009\u6837\u65b9 20m \u00d7 20m \u8303\u56f4\u5185");
    }
  }

  const locationSource = String(record.locationSource || "");
  if (settings.allowManualLocation === false && ["manual", "map", "plotCenter"].includes(locationSource)) {
    errors.push("\u7ba1\u7406\u5458\u5df2\u5173\u95ed\u624b\u52a8\u5b9a\u4f4d\uff0c\u8bf7\u4f7f\u7528\u81ea\u52a8\u5b9a\u4f4d\u540e\u4fdd\u5b58");
  }

  const hasDeadBranchRate = !isEmpty(record.deadBranchRate);
  const deadBranchRate = Number(record.deadBranchRate);
  if (hasDeadBranchRate && !Number.isNaN(deadBranchRate) && record.healthLevel === "\u5065\u5eb7" && deadBranchRate > 20) {
    errors.push("\u5065\u5eb7\u6811\u7684\u67af\u679d\u6bd4\u4f8b\u4e0d\u5e94\u8fc7\u9ad8");
  }
  if (hasDeadBranchRate && !Number.isNaN(deadBranchRate) && record.healthLevel === "\u6b7b\u4ea1" && deadBranchRate < 50) {
    errors.push("\u6b7b\u4ea1\u6837\u6811\u7684\u67af\u679d\u6bd4\u4f8b\u5e94\u660e\u663e\u504f\u9ad8");
  }
  if (record.healthLevel === "\u5065\u5eb7" && (severeLevels.has(record.pestLevel) || severeLevels.has(record.diseaseLevel))) {
    errors.push("\u5065\u5eb7\u6811\u7684\u866b\u5bb3\u6216\u75c5\u5bb3\u7ea7\u522b\u4e0d\u5e94\u4e3a\u4e25\u91cd");
  }

  return errors;
};


const validatePestReport = (record = {}) => {
  const errors = [];
  const types = new Set(["病害", "虫害"]);
  const severities = new Set(["一般", "较急", "紧急"]);
  const sources = new Set(["manual", "gps", "auto", "map", "ancient", ""]);
  const location = String(record.location || "").trim();
  const description = String(record.description || "").trim();
  const images = Array.isArray(record.images) ? record.images.filter(Boolean) : (record.image ? [record.image] : []);
  const hasLatitude = !isEmpty(record.latitude);
  const hasLongitude = !isEmpty(record.longitude);

  if (!types.has(String(record.type || ""))) errors.push("上报类型必须选择病害或虫害");
  if (!severities.has(String(record.severity || ""))) errors.push("紧急程度无效，请重新选择");
  if (!location) errors.push("地点不能为空");
  if (["暂无", "待补", "未知", "暂无位置描述"].includes(location)) errors.push("请填写有效地点，不能使用占位文字");
  if (location.length > 200) errors.push("地点不能超过200个字符");
  if (!description) errors.push("症状和现场描述不能为空");
  if (description.length < 5) errors.push("症状和现场描述至少填写5个字符");
  if (description.length > 2000) errors.push("症状和现场描述不能超过2000个字符");
  if (!images.length) errors.push("现场照片不能为空");
  if (images.length > 6) errors.push("现场照片最多上传6张");
  if (hasLatitude !== hasLongitude) errors.push("纬度和经度必须同时填写");

  [["latitude", "纬度", -90, 90], ["longitude", "经度", -180, 180], ["altitude", "海拔", 0, 9000], ["accuracy", "定位精度", 0, 10000]].forEach(([key, label, min, max]) => {
    if (isEmpty(record[key])) return;
    const value = parseRecordNumber(key, record[key]);
    if (!Number.isFinite(value)) errors.push(`${label}必须是数字`);
    else if (value < min || value > max) errors.push(`${label}范围应在${min}到${max}之间`);
  });

  if (!sources.has(String(record.locationSource || ""))) errors.push("定位来源无效");
  return errors;
};
module.exports = {
  validateTreeRecord,
  validatePestReport,
};
