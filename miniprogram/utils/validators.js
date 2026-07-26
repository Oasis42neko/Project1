const { fieldLabels, fieldSections } = require("../models/treeFields");

const numberFields = fieldSections
  .flatMap((section) => section.fields)
  .filter((field) => field.type === "number" || field.type === "digit");

const requiredFields = fieldSections
  .flatMap((section) => section.fields)
  .filter((field) => field.required)
  .map((field) => field.key)
  .concat(["latitude", "longitude"]);

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === "";

const validateTreeRecord = (record) => {
  const errors = [];

  requiredFields.forEach((key) => {
    if (isEmpty(record[key])) {
      errors.push(`${fieldLabels[key]}不能为空`);
    }
  });

  numberFields.forEach((field) => {
    const value = record[field.key];
    if (isEmpty(value)) {
      return;
    }
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) {
      errors.push(`${field.label}必须是数字`);
      return;
    }
    if (field.min !== undefined && numberValue < field.min) {
      errors.push(`${field.label}不能小于${field.min}`);
    }
    if (field.max !== undefined && numberValue > field.max) {
      errors.push(`${field.label}不能大于${field.max}`);
    }
  });

  if (!Array.isArray(record.images) || record.images.length === 0) {
    errors.push("现场照片不能为空");
  }

  if (!isEmpty(record.latitude) && (Number(record.latitude) < -90 || Number(record.latitude) > 90)) {
    errors.push("纬度范围应在 -90 到 90 之间");
  }
  if (!isEmpty(record.longitude) && (Number(record.longitude) < -180 || Number(record.longitude) > 180)) {
    errors.push("经度范围应在 -180 到 180 之间");
  }

  return errors;
};

module.exports = {
  validateTreeRecord,
};
