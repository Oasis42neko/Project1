const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION = "forest_tree_records";
const USER_COLLECTION = "forest_users";
const healthLevels = ["健康", "轻度异常", "中度异常", "重度异常", "死亡"];
const csvHeaders = [
  ["plotNo", "观测样方"],
  ["treeNo", "样树编号"],
  ["species", "树种"],
  ["latinName", "拉丁名"],
  ["forestType", "林分类型"],
  ["recordDate", "调查日期"],
  ["recorder", "记录人"],
  ["age", "树龄"],
  ["dbh", "胸径cm"],
  ["height", "树高m"],
  ["crownWidth", "冠幅m"],
  ["crownDensity", "郁闭度"],
  ["growthVigor", "长势"],
  ["healthLevel", "健康等级"],
  ["pestLevel", "虫害程度"],
  ["diseaseLevel", "病害程度"],
  ["deadBranchRate", "枯枝比例%"],
  ["hollow", "树洞腐朽"],
  ["leaning", "倾斜情况"],
  ["humanDisturbance", "人为干扰"],
  ["conservationAction", "处置建议"],
  ["reviewStatus", "复核状态"],
  ["slopePosition", "坡位"],
  ["soilMoisture", "土壤湿度"],
  ["latitude", "纬度"],
  ["longitude", "经度"],
  ["altitude", "海拔m"],
  ["remark", "备注"],
];

const ok = (data = null) => ({ success: true, data });
const fail = (errMsg) => ({ success: false, errMsg: String(errMsg && errMsg.message ? errMsg.message : errMsg) });

const ensureCollectionByName = async (name) => {
  try {
    await db.createCollection(name);
  } catch (error) {
    if (!String(error.errMsg || error.message).includes("already exists")) {
      throw error;
    }
  }
};

const ensureCollection = async () => ensureCollectionByName(COLLECTION);

const ensureUserCollection = async () => ensureCollectionByName(USER_COLLECTION);

const requireOpenId = () => {
  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    throw new Error("用户未登录");
  }
  return wxContext;
};

const getOpenId = async () => {
  const wxContext = requireOpenId();
  return ok({
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  });
};

const loginUser = async (event) => {
  await ensureUserCollection();
  const wxContext = requireOpenId();
  const profile = event.profile || {};
  const userData = {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || "",
    nickName: profile.nickName || "",
    avatarUrl: profile.avatarUrl || "",
    lastLoginAt: db.serverDate(),
  };

  const existed = await db.collection(USER_COLLECTION).where({ openid: wxContext.OPENID }).limit(1).get();
  if (existed.data.length) {
    await db.collection(USER_COLLECTION).doc(existed.data[0]._id).update({ data: userData });
    return ok({ ...existed.data[0], ...userData, _id: existed.data[0]._id });
  }

  const created = await db.collection(USER_COLLECTION).add({
    data: {
      ...userData,
      role: "recorder",
      createdAt: db.serverDate(),
    },
  });
  return ok({
    _id: created._id,
    ...userData,
    role: "recorder",
  });
};

const getMiniProgramCode = async () => {
  requireOpenId();
  const resp = await cloud.openapi.wxacode.get({ path: "pages/index/index" });
  const upload = await cloud.uploadFile({
    cloudPath: "forest-health/code.png",
    fileContent: resp.buffer,
  });
  return ok({ fileID: upload.fileID });
};

const normalizeRecord = (record, openid) => {
  const numericFields = ["age", "dbh", "height", "crownWidth", "crownDensity", "deadBranchRate", "latitude", "longitude", "altitude"];
  const normalized = { ...record };
  delete normalized._id;
  numericFields.forEach((key) => {
    if (normalized[key] !== undefined && normalized[key] !== "") {
      normalized[key] = Number(normalized[key]);
    }
  });
  normalized.images = Array.isArray(normalized.images) ? normalized.images : [];
  normalized.reviewStatus = normalized.reviewStatus || "待复核";
  normalized.updatedAt = db.serverDate();
  normalized.updatedBy = openid;
  return normalized;
};

const validateRecord = (record) => {
  const required = ["plotNo", "treeNo", "species", "forestType", "recordDate", "recorder", "dbh", "height", "growthVigor", "healthLevel", "pestLevel", "diseaseLevel", "conservationAction", "latitude", "longitude", "altitude"];
  const missing = required.filter((key) => record[key] === undefined || record[key] === null || record[key] === "");
  if (missing.length) {
    throw new Error(`缺少必填字段：${missing.join(",")}`);
  }
  if (!Array.isArray(record.images) || record.images.length === 0) {
    throw new Error("缺少必填字段：images");
  }

  const ranges = {
    age: [0, 2000],
    dbh: [0, 500],
    height: [0, 120],
    crownWidth: [0, 80],
    crownDensity: [0, 1],
    deadBranchRate: [0, 100],
    latitude: [-90, 90],
    longitude: [-180, 180],
    altitude: [0, 3000],
  };
  Object.keys(ranges).forEach((key) => {
    if (record[key] === undefined || record[key] === "") return;
    const value = Number(record[key]);
    const [min, max] = ranges[key];
    if (Number.isNaN(value) || value < min || value > max) {
      throw new Error(`${key} 超出允许范围`);
    }
  });
};

const initForestProject = async () => {
  requireOpenId();
  await ensureCollection();
  await ensureUserCollection();
  return ok({ collection: COLLECTION, userCollection: USER_COLLECTION });
};

const listTrees = async (event) => {
  requireOpenId();
  await ensureCollection();
  const limit = Math.min(Number(event.limit || 50), 100);
  const keyword = String(event.keyword || "").trim().toLowerCase();
  const res = await db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(1000).get();
  const records = keyword
    ? res.data.filter((record) => [record.treeNo, record.species, record.plotNo, record.recorder]
      .some((value) => String(value || "").toLowerCase().includes(keyword)))
    : res.data;
  return ok(records.slice(0, limit));
};

const getTree = async (event) => {
  requireOpenId();
  const res = await db.collection(COLLECTION).doc(event.id).get();
  return ok(res.data);
};

const saveTree = async (event) => {
  await ensureCollection();
  const wxContext = requireOpenId();
  const record = event.record || {};
  validateRecord(record);
  const data = normalizeRecord(record, wxContext.OPENID);

  if (record._id) {
    await db.collection(COLLECTION).doc(record._id).update({ data });
    return ok({ _id: record._id });
  }

  data.createdAt = db.serverDate();
  data.createdBy = wxContext.OPENID;
  const res = await db.collection(COLLECTION).add({ data });
  return ok({ _id: res._id });
};

const deleteTree = async (event) => {
  requireOpenId();
  await db.collection(COLLECTION).doc(event.id).remove();
  return ok({ _id: event.id });
};

const countBy = (records, key, preset = []) => {
  const map = preset.reduce((acc, name) => ({ ...acc, [name]: 0 }), {});
  records.forEach((record) => {
    const name = record[key] || "未填写";
    map[name] = (map[name] || 0) + 1;
  });
  const total = records.length || 1;
  return Object.keys(map)
    .map((name) => ({ name, count: map[name], percent: Math.round((map[name] / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
};

const statsTrees = async () => {
  requireOpenId();
  await ensureCollection();
  const res = await db.collection(COLLECTION).limit(1000).get();
  const records = res.data;
  const plots = new Set(records.map((item) => item.plotNo).filter(Boolean));
  const species = new Set(records.map((item) => item.species).filter(Boolean));
  const byHealth = countBy(records, "healthLevel", healthLevels);
  const byPlot = countBy(records, "plotNo").slice(0, 20);
  const bySpecies = countBy(records, "species").slice(0, 20);
  return ok({
    summary: {
      total: records.length,
      plots: plots.size,
      species: species.size,
      pendingReview: records.filter((item) => item.reviewStatus === "待复核").length,
      abnormal: records.filter((item) => item.healthLevel && item.healthLevel !== "健康").length,
    },
    byHealth,
    byPlot,
    bySpecies,
  });
};

const escapeCsv = (value) => {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join(";") : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const exportTrees = async () => {
  requireOpenId();
  await ensureCollection();
  const res = await db.collection(COLLECTION).orderBy("plotNo", "asc").limit(1000).get();
  const header = csvHeaders.map(([, label]) => escapeCsv(label)).join(",");
  const rows = res.data.map((record) => csvHeaders.map(([key]) => escapeCsv(record[key])).join(","));
  const csv = `\ufeff${[header, ...rows].join("\n")}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const upload = await cloud.uploadFile({
    cloudPath: `forest-health/exports/tree-records-${stamp}.csv`,
    fileContent: Buffer.from(csv, "utf8"),
  });
  return ok({ fileID: upload.fileID, count: res.data.length });
};

exports.main = async (event) => {
  try {
    switch (event.type) {
      case "getOpenId":
        return await getOpenId();
      case "loginUser":
        return await loginUser(event);
      case "getMiniProgramCode":
        return await getMiniProgramCode();
      case "createCollection":
      case "initForestProject":
        return await initForestProject();
      case "listTrees":
        return await listTrees(event);
      case "getTree":
        return await getTree(event);
      case "saveTree":
        return await saveTree(event);
      case "deleteTree":
        return await deleteTree(event);
      case "statsTrees":
        return await statsTrees();
      case "exportTrees":
        return await exportTrees();
      default:
        return fail(`未知操作：${event.type}`);
    }
  } catch (error) {
    console.error(error);
    return fail(error);
  }
};
