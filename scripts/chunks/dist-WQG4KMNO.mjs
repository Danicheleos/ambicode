#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  __esm
} from "./chunk-PSIR5CTP.mjs";

// node_modules/cookie/dist/index.js
function parseCookie(str, options) {
  const obj = new NullObject();
  const len = str.length;
  if (len < 2)
    return obj;
  const dec = options?.decode || decode;
  let index = 0;
  do {
    const eqIdx = eqIndex(str, index, len);
    if (eqIdx === len)
      break;
    const endIdx = endIndex(str, index, len);
    if (eqIdx > endIdx) {
      index = str.lastIndexOf(";", eqIdx - 1) + 1;
      continue;
    }
    const key = valueSlice(str, index, eqIdx);
    if (obj[key] === void 0) {
      obj[key] = dec(valueSlice(str, eqIdx + 1, endIdx));
    }
    index = endIdx + 1;
  } while (index < len);
  return obj;
}
function stringifyCookie(cookie, options) {
  const enc = options?.encode || defaultEncode;
  const keys = Object.keys(cookie);
  let str = "";
  for (let i = 0; i < keys.length; i++) {
    const name = keys[i];
    const val = cookie[name];
    if (val === void 0)
      continue;
    if (!cookieNameRegExp.test(name)) {
      throw new TypeError(`cookie name is invalid: ${name}`);
    }
    const value = enc(val);
    if (!cookieValueRegExp.test(value)) {
      throw new TypeError(`cookie val is invalid: ${val}`);
    }
    if (str)
      str += "; ";
    str += name + "=" + value;
  }
  return str;
}
function stringifySetCookie(cookie, options) {
  const enc = options?.encode || defaultEncode;
  if (!cookieNameRegExp.test(cookie.name)) {
    throw new TypeError(`argument name is invalid: ${cookie.name}`);
  }
  const value = cookie.value == null ? "" : enc(cookie.value);
  if (!cookieValueRegExp.test(value)) {
    throw new TypeError(`argument val is invalid: ${cookie.value}`);
  }
  let str = cookie.name + "=" + value;
  if (cookie.maxAge !== void 0) {
    if (!Number.isInteger(cookie.maxAge)) {
      throw new TypeError(`option maxAge is invalid: ${cookie.maxAge}`);
    }
    str += "; Max-Age=" + cookie.maxAge;
  }
  if (cookie.domain) {
    if (!domainValueRegExp.test(cookie.domain)) {
      throw new TypeError(`option domain is invalid: ${cookie.domain}`);
    }
    str += "; Domain=" + cookie.domain;
  }
  if (cookie.path) {
    if (!pathValueRegExp.test(cookie.path)) {
      throw new TypeError(`option path is invalid: ${cookie.path}`);
    }
    str += "; Path=" + cookie.path;
  }
  if (cookie.expires) {
    if (!Number.isFinite(cookie.expires.valueOf())) {
      throw new TypeError(`option expires is invalid: ${cookie.expires}`);
    }
    str += "; Expires=" + cookie.expires.toUTCString();
  }
  if (cookie.httpOnly) {
    str += "; HttpOnly";
  }
  if (cookie.secure) {
    str += "; Secure";
  }
  if (cookie.partitioned) {
    str += "; Partitioned";
  }
  if (cookie.priority) {
    const priority = typeof cookie.priority === "string" ? cookie.priority.toLowerCase() : void 0;
    switch (priority) {
      case "low":
        str += "; Priority=Low";
        break;
      case "medium":
        str += "; Priority=Medium";
        break;
      case "high":
        str += "; Priority=High";
        break;
      default:
        throw new TypeError(`option priority is invalid: ${cookie.priority}`);
    }
  }
  if (cookie.sameSite) {
    const sameSite = typeof cookie.sameSite === "string" ? cookie.sameSite.toLowerCase() : cookie.sameSite;
    switch (sameSite) {
      case true:
      case "strict":
        str += "; SameSite=Strict";
        break;
      case "lax":
        str += "; SameSite=Lax";
        break;
      case "none":
        str += "; SameSite=None";
        break;
      default:
        throw new TypeError(`option sameSite is invalid: ${cookie.sameSite}`);
    }
  }
  return str;
}
function parseSetCookie(str, options) {
  const dec = options?.decode || decode;
  const len = str.length;
  const endIdx = endIndex(str, 0, len);
  let eqIdx = eqIndex(str, 0, len);
  const setCookie = eqIdx < endIdx ? {
    name: valueSlice(str, 0, eqIdx),
    value: dec(valueSlice(str, eqIdx + 1, endIdx))
  } : { name: "", value: dec(valueSlice(str, 0, endIdx)) };
  let index = endIdx + 1;
  while (index < len) {
    const endIdx2 = endIndex(str, index, len);
    if (eqIdx < index)
      eqIdx = eqIndex(str, index, len);
    const attr = eqIdx < endIdx2 ? valueSlice(str, index, eqIdx) : valueSlice(str, index, endIdx2);
    const val = eqIdx < endIdx2 ? valueSlice(str, eqIdx + 1, endIdx2) : void 0;
    switch (attr.toLowerCase()) {
      case "httponly":
        setCookie.httpOnly = true;
        break;
      case "secure":
        setCookie.secure = true;
        break;
      case "partitioned":
        setCookie.partitioned = true;
        break;
      case "domain":
        setCookie.domain = val;
        break;
      case "path":
        setCookie.path = val;
        break;
      case "max-age":
        if (val && maxAgeRegExp.test(val))
          setCookie.maxAge = Number(val);
        break;
      case "expires":
        if (!val)
          break;
        const date = new Date(val);
        if (Number.isFinite(date.valueOf()))
          setCookie.expires = date;
        break;
      case "priority":
        if (!val)
          break;
        const priority = val.toLowerCase();
        if (priority === "low" || priority === "medium" || priority === "high") {
          setCookie.priority = priority;
        }
        break;
      case "samesite":
        if (!val)
          break;
        const sameSite = val.toLowerCase();
        if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
          setCookie.sameSite = sameSite;
        }
        break;
    }
    index = endIdx2 + 1;
  }
  return setCookie;
}
function endIndex(str, min, len) {
  const index = str.indexOf(";", min);
  return index === -1 ? len : index;
}
function eqIndex(str, min, len) {
  const index = str.indexOf("=", min);
  return index === -1 ? len : index;
}
function valueSlice(str, min, max) {
  if (min === max)
    return "";
  let start = min;
  let end = max;
  do {
    const code = str.charCodeAt(start);
    if (code !== 32 && code !== 9)
      break;
  } while (++start < end);
  while (end > start) {
    const code = str.charCodeAt(end - 1);
    if (code !== 32 && code !== 9)
      break;
    end--;
  }
  return str.slice(start, end);
}
function decode(str) {
  if (str.indexOf("%") === -1)
    return str;
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}
function defaultEncode(str) {
  return cookieOctetRegExp.test(str) ? str : encodeURIComponent(str);
}
var cookieNameRegExp, cookieValueRegExp, domainValueRegExp, pathValueRegExp, maxAgeRegExp, cookieOctetRegExp, NullObject;
var init_dist = __esm({
  "node_modules/cookie/dist/index.js"() {
    cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
    cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;
    domainValueRegExp = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;
    maxAgeRegExp = /^-?\d+$/;
    cookieOctetRegExp = /^[!#$&'()*+\-.\/0-9:<=>?@A-Z[\]\^_`a-z{|}~]*$/;
    NullObject = /* @__PURE__ */ (() => {
      const C = function() {
      };
      C.prototype = /* @__PURE__ */ Object.create(null);
      return C;
    })();
  }
});
init_dist();
export {
  parseCookie,
  parseSetCookie,
  stringifyCookie,
  stringifySetCookie
};
