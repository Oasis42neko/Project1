const plotOptions = Array.from({ length: 20 }, (_, index) => `FH-${String(index + 1).padStart(2, "0")}`);

const healthLevels = ["健康", "轻度异常", "中度异常", "重度异常", "死亡"];
const forestTypes = ["次生林", "人工林", "针阔混交林", "常绿阔叶林", "竹林", "低效林"];
const slopePositions = ["山脊", "上坡", "中坡", "下坡", "沟谷", "平地"];
const moistureLevels = ["偏干", "适中", "湿润", "积水"];
const commonLevels = ["无", "轻微", "中等", "严重"];
const vigorLevels = ["旺盛", "正常", "较弱", "衰弱"];
const actionOptions = ["持续观察", "病虫害复查", "枯死枝清理", "补植乡土树种", "设置保护标识", "专家复核"];
const reviewStatusOptions = ["待复核", "已通过", "退回重测"];

const fieldSections = [
  {
    title: "样树基础",
    fields: [
      { key: "plotNo", label: "观测样方", type: "picker", options: plotOptions, required: true },
      { key: "treeNo", label: "样树编号", type: "text", required: true, placeholder: "如 FH-01-001" },
      { key: "species", label: "树种", type: "text", required: true, placeholder: "如 红锥、樟树、沉香" },
      { key: "latinName", label: "拉丁名", type: "text", placeholder: "可选" },
      { key: "forestType", label: "林分类型", type: "picker", options: forestTypes, required: true },
      { key: "recordDate", label: "调查日期", type: "date", required: true },
      { key: "recorder", label: "记录人", type: "text", required: true, placeholder: "志愿者/专家姓名" },
    ],
  },
  {
    title: "生长指标",
    fields: [
      { key: "age", label: "树龄", type: "number", unit: "年", min: 0, max: 2000, placeholder: "估测值" },
      { key: "dbh", label: "胸径", type: "digit", unit: "cm", required: true, min: 0, max: 500 },
      { key: "height", label: "树高", type: "digit", unit: "m", required: true, min: 0, max: 120 },
      { key: "crownWidth", label: "冠幅", type: "digit", unit: "m", min: 0, max: 80 },
      { key: "crownDensity", label: "郁闭度", type: "digit", min: 0, max: 1, placeholder: "0-1" },
      { key: "growthVigor", label: "长势", type: "picker", options: vigorLevels, required: true },
    ],
  },
  {
    title: "健康体检",
    fields: [
      { key: "healthLevel", label: "健康等级", type: "picker", options: healthLevels, required: true },
      { key: "pestLevel", label: "虫害程度", type: "picker", options: commonLevels, required: true },
      { key: "diseaseLevel", label: "病害程度", type: "picker", options: commonLevels, required: true },
      { key: "deadBranchRate", label: "枯枝比例", type: "digit", unit: "%", min: 0, max: 100 },
      { key: "hollow", label: "树洞/腐朽", type: "picker", options: commonLevels },
      { key: "leaning", label: "倾斜情况", type: "picker", options: ["无", "轻微", "明显", "危险"] },
      { key: "humanDisturbance", label: "人为干扰", type: "picker", options: commonLevels },
      { key: "conservationAction", label: "处置建议", type: "picker", options: actionOptions, required: true },
      { key: "reviewStatus", label: "复核状态", type: "picker", options: reviewStatusOptions },
    ],
  },
  {
    title: "环境与备注",
    fields: [
      { key: "slopePosition", label: "坡位", type: "picker", options: slopePositions },
      { key: "soilMoisture", label: "土壤湿度", type: "picker", options: moistureLevels },
      { key: "altitude", label: "海拔", type: "digit", unit: "m", required: true, min: 0, max: 3000 },
      { key: "remark", label: "备注", type: "textarea", placeholder: "记录样树特征、复核意见或现场情况" },
    ],
  },
];

const fieldLabels = fieldSections.reduce((labels, section) => {
  section.fields.forEach((field) => {
    labels[field.key] = field.label;
  });
  return labels;
}, {
  latitude: "纬度",
  longitude: "经度",
  images: "现场照片",
});

const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const createEmptyTree = () => ({
  plotNo: "",
  treeNo: "",
  species: "",
  latinName: "",
  forestType: "次生林",
  recordDate: today(),
  recorder: "",
  age: "",
  dbh: "",
  height: "",
  crownWidth: "",
  crownDensity: "",
  growthVigor: "正常",
  healthLevel: "健康",
  pestLevel: "无",
  diseaseLevel: "无",
  deadBranchRate: "",
  hollow: "无",
  leaning: "无",
  humanDisturbance: "无",
  conservationAction: "持续观察",
  reviewStatus: "待复核",
  slopePosition: "",
  soilMoisture: "适中",
  latitude: "",
  longitude: "",
  altitude: "",
  remark: "",
  images: [],
});

module.exports = {
  actionOptions,
  createEmptyTree,
  fieldLabels,
  fieldSections,
  healthLevels,
  plotOptions,
  reviewStatusOptions,
};
