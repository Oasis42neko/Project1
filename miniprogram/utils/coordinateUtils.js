const parseCoordinateValue = (value) => {
  if (value === undefined || value === null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  const decimal = Number(text);
  if (Number.isFinite(decimal)) return decimal;
  const numericParts = text.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!numericParts || !numericParts.length) return NaN;
  if (numericParts.length === 1 && !/[\u00b0\u2032\u2033'\"]/.test(text)) return Number(numericParts[0]);
  if (numericParts.length < 2) return NaN;
  const degrees = Number(numericParts[0]);
  const minutes = Number(numericParts[1] || 0);
  const seconds = Number(numericParts[2] || 0);
  if (![degrees, minutes, seconds].every(Number.isFinite)) return NaN;
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return NaN;
  const sign = degrees < 0 || /[SW\u57ce\u5357]/i.test(text) ? -1 : 1;
  return sign * (Math.abs(degrees) + (minutes / 60) + (seconds / 3600));
};

const formatCoordinateDecimal = (value, fractionDigits = 6) => {
  const numberValue = parseCoordinateValue(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(fractionDigits) : '';
};

const formatCoordinateDms = (value, fractionDigits = 2) => {
  const numberValue = parseCoordinateValue(value);
  if (!Number.isFinite(numberValue)) return '';
  const sign = numberValue < 0 ? '-' : '';
  const absolute = Math.abs(numberValue);
  const degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  const secondsText = seconds.toFixed(fractionDigits).padStart(fractionDigits > 0 ? fractionDigits + 3 : 2, '0');
  return `${sign}${degrees}\u00b0${String(minutes).padStart(2, '0')}\u2032${secondsText}\u2033`;
};

module.exports = {
  parseCoordinateValue,
  formatCoordinateDecimal,
  formatCoordinateDms,
};
