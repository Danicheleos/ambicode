#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  Activity,
  Authority,
  COMMAND_ACTION_PRECEDENCE,
  CommandAction,
  MAX_SNAPSHOT_FILE_BYTES,
  PromptStage,
  ProviderId,
  RuleCategory,
  describeIssues,
  external_exports,
  loadConfig,
  matchesAnyGlob,
  mostSpecificRoot,
  normalizeRelative,
  require_dist,
  resolveInsideBoundary,
  toProjectRelative
} from "./chunk-G3MJKSZ6.mjs";
import {
  Git
} from "./chunk-7M5UXPHU.mjs";
import {
  AmbicodeError
} from "./chunk-WZ6VODTW.mjs";
import {
  __toESM
} from "./chunk-PSIR5CTP.mjs";

// src/util/hash.ts
import { createHash } from "node:crypto";
function contentHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

// src/composition/root.ts
import path14 from "node:path";

// src/ports/clock.ts
var systemClock = {
  now: () => /* @__PURE__ */ new Date(),
  elapsed: () => performance.now()
};

// src/ports/filesystem.ts
import { constants } from "node:fs";
import {
  access,
  copyFile,
  glob,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
var nodeFileSystem = {
  readText: (absolutePath) => readFile(absolutePath, "utf8"),
  readBytes: (absolutePath) => readFile(absolutePath),
  writeText: (absolutePath, contents) => writeFile(absolutePath, contents, "utf8"),
  createExclusive: async (absolutePath, contents) => {
    try {
      await writeFile(absolutePath, contents, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw error;
    }
  },
  rename: (from, to) => rename(from, to),
  mkdirp: async (absolutePath) => {
    await mkdir(absolutePath, { recursive: true });
  },
  temporaryDirectory: (prefix) => mkdtemp(path.join(tmpdir(), prefix)),
  temporaryRoot: () => tmpdir(),
  remove: (absolutePath) => rm(absolutePath, { recursive: true, force: true }),
  copyFile: (from, to) => copyFile(from, to),
  stat: (absolutePath) => stat(absolutePath),
  lstat: (absolutePath) => lstat(absolutePath),
  readdir: (absolutePath) => readdir(absolutePath, { withFileTypes: true }),
  exists: async (absolutePath) => {
    try {
      await access(absolutePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  realpath: (absolutePath) => realpath(absolutePath),
  glob: async (pattern, cwd) => {
    const found = [];
    for await (const entry of glob(pattern, { cwd })) found.push(entry.split(path.sep).join("/"));
    return found;
  },
  setTimes: (absolutePath, time) => utimes(absolutePath, time, time)
};

// src/ports/ids.ts
import { randomBytes, randomUUID } from "node:crypto";
var systemIds = {
  reviewId: () => randomUUID(),
  capability: () => randomBytes(32).toString("base64url"),
  csrfToken: () => randomBytes(32).toString("base64url")
};

// src/ports/node-process-runner.ts
import { spawn as spawn2 } from "node:child_process";
import { statSync as statSync2 } from "node:fs";
import path10 from "node:path";

// node_modules/is-plain-obj/index.js
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
}

// node_modules/execa/lib/arguments/file-url.js
import { fileURLToPath } from "node:url";
var safeNormalizeFileUrl = (file, name) => {
  const fileString = normalizeFileUrl(normalizeDenoExecPath(file));
  if (typeof fileString !== "string") {
    throw new TypeError(`${name} must be a string or a file URL: ${fileString}.`);
  }
  return fileString;
};
var normalizeDenoExecPath = (file) => isDenoExecPath(file) ? file.toString() : file;
var isDenoExecPath = (file) => typeof file !== "string" && file && Object.getPrototypeOf(file) === String.prototype;
var normalizeFileUrl = (file) => file instanceof URL ? fileURLToPath(file) : file;

// node_modules/execa/lib/methods/parameters.js
var normalizeParameters = (rawFile, rawArguments = [], rawOptions = {}) => {
  const filePath = safeNormalizeFileUrl(rawFile, "First argument");
  const [commandArguments, options] = isPlainObject(rawArguments) ? [[], rawArguments] : [rawArguments, rawOptions];
  if (!Array.isArray(commandArguments)) {
    throw new TypeError(`Second argument must be either an array of arguments or an options object: ${commandArguments}`);
  }
  if (commandArguments.some((commandArgument) => typeof commandArgument === "object" && commandArgument !== null)) {
    throw new TypeError(`Second argument must be an array of strings: ${commandArguments}`);
  }
  const normalizedArguments = commandArguments.map(String);
  const nullByteArgument = normalizedArguments.find((normalizedArgument) => normalizedArgument.includes("\0"));
  if (nullByteArgument !== void 0) {
    throw new TypeError(`Arguments cannot contain null bytes ("\\0"): ${nullByteArgument}`);
  }
  if (!isPlainObject(options)) {
    throw new TypeError(`Last argument must be an options object: ${options}`);
  }
  return [filePath, normalizedArguments, { __proto__: null, ...options }];
};

// node_modules/execa/lib/methods/template.js
import { ChildProcess } from "node:child_process";

// node_modules/execa/lib/utils/uint-array.js
import { StringDecoder } from "node:string_decoder";
var { toString: objectToString } = Object.prototype;
var isArrayBuffer = (value) => objectToString.call(value) === "[object ArrayBuffer]";
var isUint8Array = (value) => objectToString.call(value) === "[object Uint8Array]";
var bufferToUint8Array = (buffer) => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
var textEncoder = new TextEncoder();
var stringToUint8Array = (string) => textEncoder.encode(string);
var textDecoder = new TextDecoder();
var uint8ArrayToString = (uint8Array) => textDecoder.decode(uint8Array);
var joinToString = (uint8ArraysOrStrings, encoding) => {
  const strings = uint8ArraysToStrings(uint8ArraysOrStrings, encoding);
  return strings.join("");
};
var uint8ArraysToStrings = (uint8ArraysOrStrings, encoding) => {
  if (encoding === "utf8" && uint8ArraysOrStrings.every((uint8ArrayOrString) => typeof uint8ArrayOrString === "string")) {
    return uint8ArraysOrStrings;
  }
  const decoder = new StringDecoder(encoding);
  const strings = uint8ArraysOrStrings.map((uint8ArrayOrString) => typeof uint8ArrayOrString === "string" ? stringToUint8Array(uint8ArrayOrString) : uint8ArrayOrString).map((uint8Array) => decoder.write(uint8Array));
  const finalString = decoder.end();
  return finalString === "" ? strings : [...strings, finalString];
};
var joinToUint8Array = (uint8ArraysOrStrings) => {
  if (uint8ArraysOrStrings.length === 1 && isUint8Array(uint8ArraysOrStrings[0])) {
    return uint8ArraysOrStrings[0];
  }
  return concatUint8Arrays(stringsToUint8Arrays(uint8ArraysOrStrings));
};
var stringsToUint8Arrays = (uint8ArraysOrStrings) => uint8ArraysOrStrings.map((uint8ArrayOrString) => typeof uint8ArrayOrString === "string" ? stringToUint8Array(uint8ArrayOrString) : uint8ArrayOrString);
var concatUint8Arrays = (uint8Arrays) => {
  const result = new Uint8Array(getJoinLength(uint8Arrays));
  let index = 0;
  for (const uint8Array of uint8Arrays) {
    result.set(uint8Array, index);
    index += uint8Array.length;
  }
  return result;
};
var getJoinLength = (uint8Arrays) => {
  let joinLength = 0;
  for (const uint8Array of uint8Arrays) {
    joinLength += uint8Array.length;
  }
  return joinLength;
};

// node_modules/execa/lib/methods/template.js
var isTemplateString = (templates) => Array.isArray(templates) && Array.isArray(templates.raw);
var parseTemplates = (templates, expressions) => {
  let tokens = [];
  for (const [index, template] of templates.entries()) {
    tokens = parseTemplate({
      templates,
      expressions,
      tokens,
      index,
      template
    });
  }
  if (tokens.length === 0) {
    throw new TypeError("Template script must not be empty");
  }
  const [file, ...commandArguments] = tokens;
  return [file, commandArguments, {}];
};
var parseTemplate = ({ templates, expressions, tokens, index, template }) => {
  if (template === void 0) {
    throw new TypeError(`Invalid backslash sequence: ${templates.raw[index]}`);
  }
  const { nextTokens, leadingWhitespaces, trailingWhitespaces } = splitByWhitespaces(template, templates.raw[index]);
  const newTokens = concatTokens(tokens, nextTokens, leadingWhitespaces);
  if (index === expressions.length) {
    return newTokens;
  }
  const expression = expressions[index];
  const expressionTokens = Array.isArray(expression) ? expression.map((expression2) => parseExpression(expression2)) : [parseExpression(expression)];
  return concatTokens(newTokens, expressionTokens, trailingWhitespaces);
};
var splitByWhitespaces = (template, rawTemplate) => {
  if (rawTemplate.length === 0) {
    return { nextTokens: [], leadingWhitespaces: false, trailingWhitespaces: false };
  }
  const nextTokens = [];
  let templateStart = 0;
  const isLeadingWhitespaces = DELIMITERS.has(rawTemplate[0]);
  for (let templateIndex = 0, rawIndex = 0; templateIndex < template.length; templateIndex += 1, rawIndex += 1) {
    const rawCharacter = rawTemplate[rawIndex];
    if (DELIMITERS.has(rawCharacter)) {
      if (templateStart !== templateIndex) {
        nextTokens.push(template.slice(templateStart, templateIndex));
      }
      templateStart = templateIndex + 1;
    } else if (rawCharacter === "\\") {
      const nextRawCharacter = rawTemplate[rawIndex + 1];
      if (nextRawCharacter === "\n") {
        templateIndex -= 1;
        rawIndex += 1;
      } else if (nextRawCharacter === "u" && rawTemplate[rawIndex + 2] === "{") {
        rawIndex = rawTemplate.indexOf("}", rawIndex + 3);
      } else {
        rawIndex += ESCAPE_LENGTH[nextRawCharacter] ?? 1;
      }
    }
  }
  const isTrailingWhitespaces = templateStart === template.length;
  if (!isTrailingWhitespaces) {
    nextTokens.push(template.slice(templateStart));
  }
  return { nextTokens, leadingWhitespaces: isLeadingWhitespaces, trailingWhitespaces: isTrailingWhitespaces };
};
var DELIMITERS = /* @__PURE__ */ new Set([" ", "	", "\r", "\n"]);
var ESCAPE_LENGTH = { x: 3, u: 5 };
var concatTokens = (tokens, nextTokens, isSeparated) => isSeparated || tokens.length === 0 || nextTokens.length === 0 ? [...tokens, ...nextTokens] : [
  ...tokens.slice(0, -1),
  `${tokens.at(-1)}${nextTokens[0]}`,
  ...nextTokens.slice(1)
];
var parseExpression = (expression) => {
  const typeOfExpression = typeof expression;
  if (typeOfExpression === "string") {
    return expression;
  }
  if (typeOfExpression === "number") {
    return String(expression);
  }
  if (isPlainObject(expression) && ("stdout" in expression || "isMaxBuffer" in expression)) {
    return getSubprocessResult(expression);
  }
  if (expression instanceof ChildProcess || Object.prototype.toString.call(expression) === "[object Promise]") {
    throw new TypeError("Unexpected subprocess in template expression. Please use ${await subprocess} instead of ${subprocess}.");
  }
  throw new TypeError(`Unexpected "${typeOfExpression}" in template expression`);
};
var getSubprocessResult = ({ stdout }) => {
  if (typeof stdout === "string") {
    return stdout;
  }
  if (isUint8Array(stdout)) {
    return uint8ArrayToString(stdout);
  }
  if (stdout === void 0) {
    throw new TypeError(`Missing result.stdout in template expression. This is probably due to the previous subprocess' "stdout" option.`);
  }
  throw new TypeError(`Unexpected "${typeof stdout}" stdout in template expression`);
};

// node_modules/execa/lib/methods/main-sync.js
import { spawnSync } from "node:child_process";

// node_modules/execa/lib/arguments/specific.js
import { debuglog } from "node:util";

// node_modules/execa/lib/utils/standard-stream.js
import process2 from "node:process";
var isStandardStream = (stream) => STANDARD_STREAMS.includes(stream);
var STANDARD_STREAMS = [process2.stdin, process2.stdout, process2.stderr];
var STANDARD_STREAMS_ALIASES = ["stdin", "stdout", "stderr"];
var getStreamName = (fdNumber) => STANDARD_STREAMS_ALIASES[fdNumber] ?? `stdio[${fdNumber}]`;

// node_modules/execa/lib/arguments/specific.js
var normalizeFdSpecificOptions = (options) => {
  const optionsCopy = { ...options };
  for (const optionName of FD_SPECIFIC_OPTIONS) {
    optionsCopy[optionName] = normalizeFdSpecificOption(options, optionName);
  }
  return optionsCopy;
};
var normalizeFdSpecificOption = (options, optionName) => {
  const stdioLength = getStdioLength(options);
  const optionBaseArray = Array.from({ length: stdioLength + 1 });
  const optionArray = normalizeFdSpecificValue(options[optionName], optionBaseArray, optionName, stdioLength);
  return addDefaultValue(optionArray, optionName);
};
var getStdioLength = ({ stdio }) => Array.isArray(stdio) ? Math.max(stdio.length, STANDARD_STREAMS_ALIASES.length) : STANDARD_STREAMS_ALIASES.length;
var normalizeFdSpecificValue = (optionValue, optionArray, optionName, stdioLength) => isPlainObject(optionValue) ? normalizeOptionObject(optionValue, optionArray, optionName, stdioLength) : optionArray.fill(optionValue);
var normalizeOptionObject = (optionValue, optionArray, optionName, stdioLength) => {
  for (const fdName of Object.keys(optionValue).sort(compareFdName)) {
    for (const fdNumber of parseFdName(fdName, optionName, stdioLength)) {
      optionArray[fdNumber] = optionValue[fdName];
    }
  }
  return optionArray;
};
var compareFdName = (fdNameA, fdNameB) => getFdNameOrder(fdNameA) < getFdNameOrder(fdNameB) ? 1 : -1;
var getFdNameOrder = (fdName) => {
  if (fdName === "stdout" || fdName === "stderr") {
    return 0;
  }
  return fdName === "all" ? 2 : 1;
};
var parseFdName = (fdName, optionName, stdioLength) => {
  if (fdName === "ipc") {
    return [stdioLength];
  }
  const fdNumber = parseFd(fdName);
  if (fdNumber === void 0 || fdNumber === 0) {
    throw new TypeError(`"${optionName}.${fdName}" is invalid.
It must be "${optionName}.stdout", "${optionName}.stderr", "${optionName}.all", "${optionName}.ipc", or "${optionName}.fd3", "${optionName}.fd4" (and so on).`);
  }
  if (fdNumber !== "all" && fdNumber >= stdioLength) {
    throw new TypeError(`"${optionName}.${fdName}" is invalid: that file descriptor does not exist.
Please set the "stdio" option to ensure that file descriptor exists.`);
  }
  return fdNumber === "all" ? [1, 2] : [fdNumber];
};
var parseFd = (fdName) => {
  if (fdName === "all") {
    return fdName;
  }
  if (STANDARD_STREAMS_ALIASES.includes(fdName)) {
    return STANDARD_STREAMS_ALIASES.indexOf(fdName);
  }
  const regexpResult = FD_REGEXP.exec(fdName);
  if (regexpResult !== null) {
    return Number(regexpResult.groups.fdNumber);
  }
};
var FD_REGEXP = /^fd(?<fdNumber>\d+)$/;
var addDefaultValue = (optionArray, optionName) => optionArray.map((optionValue) => optionValue === void 0 ? DEFAULT_OPTIONS[optionName] : optionValue);
var verboseDefault = debuglog("execa").enabled ? "full" : "none";
var DEFAULT_OPTIONS = {
  lines: false,
  buffer: true,
  maxBuffer: 1e3 * 1e3 * 100,
  verbose: verboseDefault,
  stripFinalNewline: true
};
var FD_SPECIFIC_OPTIONS = ["lines", "buffer", "maxBuffer", "verbose", "stripFinalNewline"];
var getFdSpecificValue = (optionArray, fdNumber) => fdNumber === "ipc" ? optionArray.at(-1) : optionArray[fdNumber];

// node_modules/execa/lib/verbose/values.js
var isVerbose = ({ verbose }, fdNumber) => getFdVerbose(verbose, fdNumber) !== "none";
var isFullVerbose = ({ verbose }, fdNumber) => !["none", "short"].includes(getFdVerbose(verbose, fdNumber));
var getVerboseFunction = ({ verbose }, fdNumber) => {
  const fdVerbose = getFdVerbose(verbose, fdNumber);
  return isVerboseFunction(fdVerbose) ? fdVerbose : void 0;
};
var getFdVerbose = (verbose, fdNumber) => fdNumber === void 0 ? getFdGenericVerbose(verbose) : getFdSpecificValue(verbose, fdNumber);
var getFdGenericVerbose = (verbose) => verbose.find((fdVerbose) => isVerboseFunction(fdVerbose)) ?? VERBOSE_VALUES.findLast((fdVerbose) => verbose.includes(fdVerbose));
var isVerboseFunction = (fdVerbose) => typeof fdVerbose === "function";
var VERBOSE_VALUES = ["none", "short", "full"];

// node_modules/execa/lib/verbose/log.js
import { inspect } from "node:util";

// node_modules/execa/lib/arguments/escape.js
import { platform } from "node:process";
import { stripVTControlCharacters } from "node:util";
var joinCommand = (filePath, rawArguments) => {
  const fileAndArguments = [filePath, ...rawArguments];
  const command = fileAndArguments.join(" ");
  const escapedCommand = fileAndArguments.map((fileAndArgument) => quoteString(escapeControlCharacters(fileAndArgument))).join(" ");
  return { command, escapedCommand };
};
var escapeLines = (lines) => stripVTControlCharacters(lines).split("\n").map((line) => escapeControlCharacters(line)).join("\n");
var escapeControlCharacters = (line) => line.replaceAll(SPECIAL_CHAR_REGEXP, (character) => escapeControlCharacter(character));
var escapeControlCharacter = (character) => {
  const commonEscape = COMMON_ESCAPES[character];
  if (commonEscape !== void 0) {
    return commonEscape;
  }
  const codepoint = character.codePointAt(0);
  const codepointHex = codepoint.toString(16);
  return codepoint <= ASTRAL_START ? `\\u${codepointHex.padStart(4, "0")}` : `\\U${codepointHex}`;
};
var getSpecialCharRegExp = () => {
  try {
    return new RegExp("\\p{Separator}|\\p{Other}", "gu");
  } catch {
    return /[\s\u0000-\u001F\u007F-\u009F\u00AD]/g;
  }
};
var SPECIAL_CHAR_REGEXP = getSpecialCharRegExp();
var COMMON_ESCAPES = {
  " ": " ",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t"
};
var ASTRAL_START = 65535;
var quoteString = (escapedArgument) => {
  if (NO_ESCAPE_REGEXP.test(escapedArgument)) {
    return escapedArgument;
  }
  return platform === "win32" ? `"${escapedArgument.replaceAll('"', '""')}"` : `'${escapedArgument.replaceAll("'", "'\\''")}'`;
};
var NO_ESCAPE_REGEXP = /^[\w\-./]+$/;

// node_modules/is-unicode-supported/index.js
import process3 from "node:process";
function isUnicodeSupported() {
  const { env } = process3;
  const { TERM, TERM_PROGRAM } = env;
  if (process3.platform !== "win32") {
    return TERM !== "linux";
  }
  return Boolean(env.WT_SESSION) || Boolean(env.TERMINUS_SUBLIME) || env.ConEmuTask === "{cmd::Cmder}" || TERM_PROGRAM === "Terminus-Sublime" || TERM_PROGRAM === "vscode" || TERM === "xterm-256color" || TERM === "alacritty" || TERM === "rxvt-unicode" || TERM === "rxvt-unicode-256color" || env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}

// node_modules/figures/index.js
var common = {
  circleQuestionMark: "(?)",
  questionMarkPrefix: "(?)",
  square: "\u2588",
  squareDarkShade: "\u2593",
  squareMediumShade: "\u2592",
  squareLightShade: "\u2591",
  squareTop: "\u2580",
  squareBottom: "\u2584",
  squareLeft: "\u258C",
  squareRight: "\u2590",
  squareCenter: "\u25A0",
  bullet: "\u25CF",
  dot: "\u2024",
  ellipsis: "\u2026",
  pointerSmall: "\u203A",
  triangleUp: "\u25B2",
  triangleUpSmall: "\u25B4",
  triangleDown: "\u25BC",
  triangleDownSmall: "\u25BE",
  triangleLeftSmall: "\u25C2",
  triangleRightSmall: "\u25B8",
  home: "\u2302",
  heart: "\u2665",
  musicNote: "\u266A",
  musicNoteBeamed: "\u266B",
  arrowUp: "\u2191",
  arrowDown: "\u2193",
  arrowLeft: "\u2190",
  arrowRight: "\u2192",
  arrowLeftRight: "\u2194",
  arrowUpDown: "\u2195",
  almostEqual: "\u2248",
  notEqual: "\u2260",
  lessOrEqual: "\u2264",
  greaterOrEqual: "\u2265",
  identical: "\u2261",
  infinity: "\u221E",
  subscriptZero: "\u2080",
  subscriptOne: "\u2081",
  subscriptTwo: "\u2082",
  subscriptThree: "\u2083",
  subscriptFour: "\u2084",
  subscriptFive: "\u2085",
  subscriptSix: "\u2086",
  subscriptSeven: "\u2087",
  subscriptEight: "\u2088",
  subscriptNine: "\u2089",
  oneHalf: "\xBD",
  oneThird: "\u2153",
  oneQuarter: "\xBC",
  oneFifth: "\u2155",
  oneSixth: "\u2159",
  oneEighth: "\u215B",
  twoThirds: "\u2154",
  twoFifths: "\u2156",
  threeQuarters: "\xBE",
  threeFifths: "\u2157",
  threeEighths: "\u215C",
  fourFifths: "\u2158",
  fiveSixths: "\u215A",
  fiveEighths: "\u215D",
  sevenEighths: "\u215E",
  line: "\u2500",
  lineBold: "\u2501",
  lineDouble: "\u2550",
  lineDashed0: "\u2504",
  lineDashed1: "\u2505",
  lineDashed2: "\u2508",
  lineDashed3: "\u2509",
  lineDashed4: "\u254C",
  lineDashed5: "\u254D",
  lineDashed6: "\u2574",
  lineDashed7: "\u2576",
  lineDashed8: "\u2578",
  lineDashed9: "\u257A",
  lineDashed10: "\u257C",
  lineDashed11: "\u257E",
  lineDashed12: "\u2212",
  lineDashed13: "\u2013",
  lineDashed14: "\u2010",
  lineDashed15: "\u2043",
  lineVertical: "\u2502",
  lineVerticalBold: "\u2503",
  lineVerticalDouble: "\u2551",
  lineVerticalDashed0: "\u2506",
  lineVerticalDashed1: "\u2507",
  lineVerticalDashed2: "\u250A",
  lineVerticalDashed3: "\u250B",
  lineVerticalDashed4: "\u254E",
  lineVerticalDashed5: "\u254F",
  lineVerticalDashed6: "\u2575",
  lineVerticalDashed7: "\u2577",
  lineVerticalDashed8: "\u2579",
  lineVerticalDashed9: "\u257B",
  lineVerticalDashed10: "\u257D",
  lineVerticalDashed11: "\u257F",
  lineDownLeft: "\u2510",
  lineDownLeftArc: "\u256E",
  lineDownBoldLeftBold: "\u2513",
  lineDownBoldLeft: "\u2512",
  lineDownLeftBold: "\u2511",
  lineDownDoubleLeftDouble: "\u2557",
  lineDownDoubleLeft: "\u2556",
  lineDownLeftDouble: "\u2555",
  lineDownRight: "\u250C",
  lineDownRightArc: "\u256D",
  lineDownBoldRightBold: "\u250F",
  lineDownBoldRight: "\u250E",
  lineDownRightBold: "\u250D",
  lineDownDoubleRightDouble: "\u2554",
  lineDownDoubleRight: "\u2553",
  lineDownRightDouble: "\u2552",
  lineUpLeft: "\u2518",
  lineUpLeftArc: "\u256F",
  lineUpBoldLeftBold: "\u251B",
  lineUpBoldLeft: "\u251A",
  lineUpLeftBold: "\u2519",
  lineUpDoubleLeftDouble: "\u255D",
  lineUpDoubleLeft: "\u255C",
  lineUpLeftDouble: "\u255B",
  lineUpRight: "\u2514",
  lineUpRightArc: "\u2570",
  lineUpBoldRightBold: "\u2517",
  lineUpBoldRight: "\u2516",
  lineUpRightBold: "\u2515",
  lineUpDoubleRightDouble: "\u255A",
  lineUpDoubleRight: "\u2559",
  lineUpRightDouble: "\u2558",
  lineUpDownLeft: "\u2524",
  lineUpBoldDownBoldLeftBold: "\u252B",
  lineUpBoldDownBoldLeft: "\u2528",
  lineUpDownLeftBold: "\u2525",
  lineUpBoldDownLeftBold: "\u2529",
  lineUpDownBoldLeftBold: "\u252A",
  lineUpDownBoldLeft: "\u2527",
  lineUpBoldDownLeft: "\u2526",
  lineUpDoubleDownDoubleLeftDouble: "\u2563",
  lineUpDoubleDownDoubleLeft: "\u2562",
  lineUpDownLeftDouble: "\u2561",
  lineUpDownRight: "\u251C",
  lineUpBoldDownBoldRightBold: "\u2523",
  lineUpBoldDownBoldRight: "\u2520",
  lineUpDownRightBold: "\u251D",
  lineUpBoldDownRightBold: "\u2521",
  lineUpDownBoldRightBold: "\u2522",
  lineUpDownBoldRight: "\u251F",
  lineUpBoldDownRight: "\u251E",
  lineUpDoubleDownDoubleRightDouble: "\u2560",
  lineUpDoubleDownDoubleRight: "\u255F",
  lineUpDownRightDouble: "\u255E",
  lineDownLeftRight: "\u252C",
  lineDownBoldLeftBoldRightBold: "\u2533",
  lineDownLeftBoldRightBold: "\u252F",
  lineDownBoldLeftRight: "\u2530",
  lineDownBoldLeftBoldRight: "\u2531",
  lineDownBoldLeftRightBold: "\u2532",
  lineDownLeftRightBold: "\u252E",
  lineDownLeftBoldRight: "\u252D",
  lineDownDoubleLeftDoubleRightDouble: "\u2566",
  lineDownDoubleLeftRight: "\u2565",
  lineDownLeftDoubleRightDouble: "\u2564",
  lineUpLeftRight: "\u2534",
  lineUpBoldLeftBoldRightBold: "\u253B",
  lineUpLeftBoldRightBold: "\u2537",
  lineUpBoldLeftRight: "\u2538",
  lineUpBoldLeftBoldRight: "\u2539",
  lineUpBoldLeftRightBold: "\u253A",
  lineUpLeftRightBold: "\u2536",
  lineUpLeftBoldRight: "\u2535",
  lineUpDoubleLeftDoubleRightDouble: "\u2569",
  lineUpDoubleLeftRight: "\u2568",
  lineUpLeftDoubleRightDouble: "\u2567",
  lineUpDownLeftRight: "\u253C",
  lineUpBoldDownBoldLeftBoldRightBold: "\u254B",
  lineUpDownBoldLeftBoldRightBold: "\u2548",
  lineUpBoldDownLeftBoldRightBold: "\u2547",
  lineUpBoldDownBoldLeftRightBold: "\u254A",
  lineUpBoldDownBoldLeftBoldRight: "\u2549",
  lineUpBoldDownLeftRight: "\u2540",
  lineUpDownBoldLeftRight: "\u2541",
  lineUpDownLeftBoldRight: "\u253D",
  lineUpDownLeftRightBold: "\u253E",
  lineUpBoldDownBoldLeftRight: "\u2542",
  lineUpDownLeftBoldRightBold: "\u253F",
  lineUpBoldDownLeftBoldRight: "\u2543",
  lineUpBoldDownLeftRightBold: "\u2544",
  lineUpDownBoldLeftBoldRight: "\u2545",
  lineUpDownBoldLeftRightBold: "\u2546",
  lineUpDoubleDownDoubleLeftDoubleRightDouble: "\u256C",
  lineUpDoubleDownDoubleLeftRight: "\u256B",
  lineUpDownLeftDoubleRightDouble: "\u256A",
  lineCross: "\u2573",
  lineBackslash: "\u2572",
  lineSlash: "\u2571"
};
var specialMainSymbols = {
  tick: "\u2714",
  info: "\u2139",
  warning: "\u26A0",
  cross: "\u2718",
  squareSmall: "\u25FB",
  squareSmallFilled: "\u25FC",
  circle: "\u25EF",
  circleFilled: "\u25C9",
  circleDotted: "\u25CC",
  circleDouble: "\u25CE",
  circleCircle: "\u24DE",
  circleCross: "\u24E7",
  circlePipe: "\u24BE",
  radioOn: "\u25C9",
  radioOff: "\u25EF",
  checkboxOn: "\u2612",
  checkboxOff: "\u2610",
  checkboxCircleOn: "\u24E7",
  checkboxCircleOff: "\u24BE",
  pointer: "\u276F",
  triangleUpOutline: "\u25B3",
  triangleLeft: "\u25C0",
  triangleRight: "\u25B6",
  lozenge: "\u25C6",
  lozengeOutline: "\u25C7",
  hamburger: "\u2630",
  smiley: "\u32E1",
  mustache: "\u0DF4",
  star: "\u2605",
  play: "\u25B6",
  nodejs: "\u2B22",
  oneSeventh: "\u2150",
  oneNinth: "\u2151",
  oneTenth: "\u2152"
};
var specialFallbackSymbols = {
  tick: "\u221A",
  info: "i",
  warning: "\u203C",
  cross: "\xD7",
  squareSmall: "\u25A1",
  squareSmallFilled: "\u25A0",
  circle: "( )",
  circleFilled: "(*)",
  circleDotted: "( )",
  circleDouble: "( )",
  circleCircle: "(\u25CB)",
  circleCross: "(\xD7)",
  circlePipe: "(\u2502)",
  radioOn: "(*)",
  radioOff: "( )",
  checkboxOn: "[\xD7]",
  checkboxOff: "[ ]",
  checkboxCircleOn: "(\xD7)",
  checkboxCircleOff: "( )",
  pointer: ">",
  triangleUpOutline: "\u2206",
  triangleLeft: "\u25C4",
  triangleRight: "\u25BA",
  lozenge: "\u2666",
  lozengeOutline: "\u25CA",
  hamburger: "\u2261",
  smiley: "\u263A",
  mustache: "\u250C\u2500\u2510",
  star: "\u2736",
  play: "\u25BA",
  nodejs: "\u2666",
  oneSeventh: "1/7",
  oneNinth: "1/9",
  oneTenth: "1/10"
};
var mainSymbols = { ...common, ...specialMainSymbols };
var fallbackSymbols = { ...common, ...specialFallbackSymbols };
var shouldUseMain = isUnicodeSupported();
var figures = shouldUseMain ? mainSymbols : fallbackSymbols;
var figures_default = figures;
var replacements = Object.entries(specialMainSymbols);

// node_modules/yoctocolors/base.js
import tty from "node:tty";
var hasColors = tty?.WriteStream?.prototype?.hasColors?.() ?? false;
var format = (open2, close) => {
  if (!hasColors) {
    return (input) => input;
  }
  const openCode = `\x1B[${open2}m`;
  const closeCode = `\x1B[${close}m`;
  return (input) => {
    const string = input + "";
    let index = string.indexOf(closeCode);
    if (index === -1) {
      return openCode + string + closeCode;
    }
    let result = openCode;
    let lastIndex = 0;
    const reopenOnNestedClose = close === 22;
    const replaceCode = (reopenOnNestedClose ? closeCode : "") + openCode;
    while (index !== -1) {
      result += string.slice(lastIndex, index) + replaceCode;
      lastIndex = index + closeCode.length;
      index = string.indexOf(closeCode, lastIndex);
    }
    result += string.slice(lastIndex) + closeCode;
    return result;
  };
};
var reset = format(0, 0);
var bold = format(1, 22);
var dim = format(2, 22);
var italic = format(3, 23);
var underline = format(4, 24);
var underlineDouble = format("4:2", 24);
var underlineCurly = format("4:3", 24);
var underlineDotted = format("4:4", 24);
var underlineDashed = format("4:5", 24);
var overline = format(53, 55);
var inverse = format(7, 27);
var hidden = format(8, 28);
var strikethrough = format(9, 29);
var black = format(30, 39);
var red = format(31, 39);
var green = format(32, 39);
var yellow = format(33, 39);
var blue = format(34, 39);
var magenta = format(35, 39);
var cyan = format(36, 39);
var white = format(37, 39);
var gray = format(90, 39);
var bgBlack = format(40, 49);
var bgRed = format(41, 49);
var bgGreen = format(42, 49);
var bgYellow = format(43, 49);
var bgBlue = format(44, 49);
var bgMagenta = format(45, 49);
var bgCyan = format(46, 49);
var bgWhite = format(47, 49);
var bgGray = format(100, 49);
var redBright = format(91, 39);
var greenBright = format(92, 39);
var yellowBright = format(93, 39);
var blueBright = format(94, 39);
var magentaBright = format(95, 39);
var cyanBright = format(96, 39);
var whiteBright = format(97, 39);
var bgRedBright = format(101, 49);
var bgGreenBright = format(102, 49);
var bgYellowBright = format(103, 49);
var bgBlueBright = format(104, 49);
var bgMagentaBright = format(105, 49);
var bgCyanBright = format(106, 49);
var bgWhiteBright = format(107, 49);
var underlineBlack = format("58;5;0", 59);
var underlineRed = format("58;5;1", 59);
var underlineGreen = format("58;5;2", 59);
var underlineYellow = format("58;5;3", 59);
var underlineBlue = format("58;5;4", 59);
var underlineMagenta = format("58;5;5", 59);
var underlineCyan = format("58;5;6", 59);
var underlineWhite = format("58;5;7", 59);
var underlineGray = format("58;5;8", 59);
var underlineRedBright = format("58;5;9", 59);
var underlineGreenBright = format("58;5;10", 59);
var underlineYellowBright = format("58;5;11", 59);
var underlineBlueBright = format("58;5;12", 59);
var underlineMagentaBright = format("58;5;13", 59);
var underlineCyanBright = format("58;5;14", 59);
var underlineWhiteBright = format("58;5;15", 59);

// node_modules/execa/lib/verbose/default.js
var defaultVerboseFunction = ({
  type,
  message,
  timestamp,
  piped,
  commandId,
  result: { failed: failed2 = false } = {},
  options: { reject = true }
}) => {
  const timestampString = serializeTimestamp(timestamp);
  const icon = ICONS[type]({ failed: failed2, reject, piped });
  const color = COLORS[type]({ reject });
  return `${gray(`[${timestampString}]`)} ${gray(`[${commandId}]`)} ${color(icon)} ${color(message)}`;
};
var serializeTimestamp = (timestamp) => `${padField(timestamp.getHours(), 2)}:${padField(timestamp.getMinutes(), 2)}:${padField(timestamp.getSeconds(), 2)}.${padField(timestamp.getMilliseconds(), 3)}`;
var padField = (field, padding) => String(field).padStart(padding, "0");
var getFinalIcon = ({ failed: failed2, reject }) => {
  if (!failed2) {
    return figures_default.tick;
  }
  return reject ? figures_default.cross : figures_default.warning;
};
var ICONS = {
  command: ({ piped }) => piped ? "|" : "$",
  output: () => " ",
  ipc: () => "*",
  error: getFinalIcon,
  duration: getFinalIcon
};
var identity = (string) => string;
var COLORS = {
  command: () => bold,
  output: () => identity,
  ipc: () => identity,
  error: ({ reject }) => reject ? redBright : yellowBright,
  duration: () => gray
};

// node_modules/execa/lib/verbose/custom.js
var applyVerboseOnLines = (printedLines, verboseInfo, fdNumber) => {
  const verboseFunction = getVerboseFunction(verboseInfo, fdNumber);
  return printedLines.map(({ verboseLine, verboseObject }) => applyVerboseFunction(verboseLine, verboseObject, verboseFunction)).filter((printedLine) => printedLine !== void 0).map((printedLine) => appendNewline(printedLine)).join("");
};
var applyVerboseFunction = (verboseLine, verboseObject, verboseFunction) => {
  if (verboseFunction === void 0) {
    return verboseLine;
  }
  const printedLine = verboseFunction(verboseLine, verboseObject);
  if (typeof printedLine === "string") {
    return printedLine;
  }
};
var appendNewline = (printedLine) => printedLine.endsWith("\n") ? printedLine : `${printedLine}
`;

// node_modules/execa/lib/verbose/log.js
var verboseLog = ({ type, verboseMessage, fdNumber, verboseInfo, result }) => {
  const verboseObject = getVerboseObject({ type, result, verboseInfo });
  const printedLines = getPrintedLines(verboseMessage, verboseObject);
  const finalLines = applyVerboseOnLines(printedLines, verboseInfo, fdNumber);
  if (finalLines !== "") {
    console.warn(finalLines.slice(0, -1));
  }
};
var getVerboseObject = ({ type, result, verboseInfo }) => {
  const { escapedCommand, commandId, rawOptions } = verboseInfo;
  const { piped = false, ...options } = rawOptions;
  return {
    type,
    escapedCommand,
    commandId: `${commandId}`,
    timestamp: /* @__PURE__ */ new Date(),
    piped,
    result,
    options
  };
};
var getPrintedLines = (verboseMessage, verboseObject) => verboseMessage.split("\n").map((message) => getPrintedLine({ ...verboseObject, message }));
var getPrintedLine = (verboseObject) => {
  const verboseLine = defaultVerboseFunction(verboseObject);
  return { verboseLine, verboseObject };
};
var serializeVerboseMessage = (message) => {
  const messageString = typeof message === "string" ? message : inspect(message);
  const escapedMessage = escapeLines(messageString);
  return escapedMessage.replaceAll("	", () => " ".repeat(TAB_SIZE));
};
var TAB_SIZE = 2;

// node_modules/execa/lib/verbose/start.js
var logCommand = (escapedCommand, verboseInfo) => {
  if (!isVerbose(verboseInfo)) {
    return;
  }
  verboseLog({
    type: "command",
    verboseMessage: escapedCommand,
    verboseInfo
  });
};

// node_modules/execa/lib/verbose/info.js
var getVerboseInfo = (verbose, escapedCommand, rawOptions) => {
  validateVerbose(verbose);
  const commandId = getCommandId(verbose);
  return {
    verbose,
    escapedCommand,
    commandId,
    rawOptions
  };
};
var getCommandId = (verbose) => isVerbose({ verbose }) ? COMMAND_ID++ : void 0;
var COMMAND_ID = 0n;
var validateVerbose = (verbose) => {
  for (const fdVerbose of verbose) {
    if (fdVerbose === false) {
      throw new TypeError(`The "verbose: false" option was renamed to "verbose: 'none'".`);
    }
    if (fdVerbose === true) {
      throw new TypeError(`The "verbose: true" option was renamed to "verbose: 'short'".`);
    }
    if (!VERBOSE_VALUES.includes(fdVerbose) && !isVerboseFunction(fdVerbose)) {
      const allowedValues = VERBOSE_VALUES.map((allowedValue) => `'${allowedValue}'`).join(", ");
      throw new TypeError(`The "verbose" option must not be ${fdVerbose}. Allowed values are: ${allowedValues} or a function.`);
    }
  }
};

// node_modules/execa/lib/return/duration.js
import { hrtime } from "node:process";
var getStartTime = () => hrtime.bigint();
var getDurationMs = (startTime) => Number(hrtime.bigint() - startTime) / 1e6;

// node_modules/execa/lib/arguments/command.js
var handleCommand = (filePath, rawArguments, rawOptions) => {
  const startTime = getStartTime();
  const { command, escapedCommand } = joinCommand(filePath, rawArguments);
  const verbose = normalizeFdSpecificOption(rawOptions, "verbose");
  const verboseInfo = getVerboseInfo(verbose, escapedCommand, { ...rawOptions });
  logCommand(escapedCommand, verboseInfo);
  return {
    command,
    escapedCommand,
    startTime,
    verboseInfo
  };
};

// node_modules/execa/lib/arguments/options.js
import path8 from "node:path";
import process8 from "node:process";

// node_modules/npm-run-path/index.js
import process4 from "node:process";
import path3 from "node:path";

// node_modules/path-key/index.js
function pathKey(options = {}) {
  const {
    env = process.env,
    platform: platform2 = process.platform
  } = options;
  if (platform2 !== "win32") {
    return "PATH";
  }
  return Object.keys(env).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
}

// node_modules/unicorn-magic/node.js
import { promisify } from "node:util";
import { execFile as execFileCallback, execFileSync as execFileSyncOriginal } from "node:child_process";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var execFileOriginal = promisify(execFileCallback);
function toPath(urlOrPath) {
  return urlOrPath instanceof URL ? fileURLToPath2(urlOrPath) : urlOrPath;
}
function traversePathUp(startPath) {
  return {
    *[Symbol.iterator]() {
      let currentPath = path2.resolve(toPath(startPath));
      let previousPath;
      while (previousPath !== currentPath) {
        yield currentPath;
        previousPath = currentPath;
        currentPath = path2.resolve(currentPath, "..");
      }
    }
  };
}
var TEN_MEGABYTES_IN_BYTES = 10 * 1024 * 1024;

// node_modules/npm-run-path/index.js
var npmRunPath = ({
  cwd = process4.cwd(),
  path: pathOption = process4.env[pathKey()],
  preferLocal = true,
  execPath: execPath2 = process4.execPath,
  addExecPath = true
} = {}) => {
  const cwdPath = path3.resolve(toPath(cwd));
  const result = [];
  const pathParts = pathOption.split(path3.delimiter);
  if (preferLocal) {
    applyPreferLocal(result, pathParts, cwdPath);
  }
  if (addExecPath) {
    applyExecPath(result, pathParts, execPath2, cwdPath);
  }
  return pathOption === "" || pathOption === path3.delimiter ? `${result.join(path3.delimiter)}${pathOption}` : [...result, pathOption].join(path3.delimiter);
};
var applyPreferLocal = (result, pathParts, cwdPath) => {
  for (const directory of traversePathUp(cwdPath)) {
    const pathPart = path3.join(directory, "node_modules/.bin");
    if (!pathParts.includes(pathPart)) {
      result.push(pathPart);
    }
  }
};
var applyExecPath = (result, pathParts, execPath2, cwdPath) => {
  const pathPart = path3.resolve(cwdPath, toPath(execPath2), "..");
  if (!pathParts.includes(pathPart)) {
    result.push(pathPart);
  }
};
var npmRunPathEnv = ({ env = process4.env, ...options } = {}) => {
  env = { ...env };
  const pathName = pathKey({ env });
  options.path = env[pathName];
  env[pathName] = npmRunPath(options);
  return env;
};

// node_modules/execa/lib/terminate/kill.js
import { setTimeout as setTimeout2 } from "node:timers/promises";

// node_modules/execa/lib/return/final-error.js
var getFinalError = (originalError, message, isSync) => {
  const ErrorClass = isSync ? ExecaSyncError : ExecaError;
  const options = originalError instanceof DiscardedError ? {} : { cause: originalError };
  return new ErrorClass(message, options);
};
var DiscardedError = class extends Error {
};
var setErrorName = (ErrorClass, value) => {
  Object.defineProperties(ErrorClass.prototype, {
    name: {
      value,
      writable: true,
      enumerable: false,
      configurable: true
    },
    [execaErrorSymbol]: {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false
    }
  });
};
var isExecaError = (error) => isErrorInstance(error) && execaErrorSymbol in error;
var execaErrorSymbol = /* @__PURE__ */ Symbol("isExecaError");
var isErrorInstance = (value) => Object.prototype.toString.call(value) === "[object Error]";
var ExecaError = class extends Error {
};
setErrorName(ExecaError, ExecaError.name);
var ExecaSyncError = class extends Error {
};
setErrorName(ExecaSyncError, ExecaSyncError.name);

// node_modules/execa/lib/terminate/signal.js
import { constants as constants4 } from "node:os";

// node_modules/human-signals/build/src/main.js
import { constants as constants3 } from "node:os";

// node_modules/human-signals/build/src/realtime.js
var getRealtimeSignals = () => {
  const length = SIGRTMAX - SIGRTMIN + 1;
  return Array.from({ length }, getRealtimeSignal);
};
var getRealtimeSignal = (value, index) => ({
  name: `SIGRT${index + 1}`,
  number: SIGRTMIN + index,
  action: "terminate",
  description: "Application-specific signal (realtime)",
  standard: "posix"
});
var SIGRTMIN = 34;
var SIGRTMAX = 64;

// node_modules/human-signals/build/src/signals.js
import { constants as constants2 } from "node:os";

// node_modules/human-signals/build/src/core.js
var SIGNALS = [
  {
    name: "SIGHUP",
    number: 1,
    action: "terminate",
    description: "Terminal closed",
    standard: "posix"
  },
  {
    name: "SIGINT",
    number: 2,
    action: "terminate",
    description: "User interruption with CTRL-C",
    standard: "ansi"
  },
  {
    name: "SIGQUIT",
    number: 3,
    action: "core",
    description: "User interruption with CTRL-\\",
    standard: "posix"
  },
  {
    name: "SIGILL",
    number: 4,
    action: "core",
    description: "Invalid machine instruction",
    standard: "ansi"
  },
  {
    name: "SIGTRAP",
    number: 5,
    action: "core",
    description: "Debugger breakpoint",
    standard: "posix"
  },
  {
    name: "SIGABRT",
    number: 6,
    action: "core",
    description: "Aborted",
    standard: "ansi"
  },
  {
    name: "SIGIOT",
    number: 6,
    action: "core",
    description: "Aborted",
    standard: "bsd"
  },
  {
    name: "SIGBUS",
    number: 7,
    action: "core",
    description: "Bus error due to misaligned, non-existing address or paging error",
    standard: "bsd"
  },
  {
    name: "SIGEMT",
    number: 7,
    action: "terminate",
    description: "Command should be emulated but is not implemented",
    standard: "other"
  },
  {
    name: "SIGFPE",
    number: 8,
    action: "core",
    description: "Floating point arithmetic error",
    standard: "ansi"
  },
  {
    name: "SIGKILL",
    number: 9,
    action: "terminate",
    description: "Forced termination",
    standard: "posix",
    forced: true
  },
  {
    name: "SIGUSR1",
    number: 10,
    action: "terminate",
    description: "Application-specific signal",
    standard: "posix"
  },
  {
    name: "SIGSEGV",
    number: 11,
    action: "core",
    description: "Segmentation fault",
    standard: "ansi"
  },
  {
    name: "SIGUSR2",
    number: 12,
    action: "terminate",
    description: "Application-specific signal",
    standard: "posix"
  },
  {
    name: "SIGPIPE",
    number: 13,
    action: "terminate",
    description: "Broken pipe or socket",
    standard: "posix"
  },
  {
    name: "SIGALRM",
    number: 14,
    action: "terminate",
    description: "Timeout or timer",
    standard: "posix"
  },
  {
    name: "SIGTERM",
    number: 15,
    action: "terminate",
    description: "Termination",
    standard: "ansi"
  },
  {
    name: "SIGSTKFLT",
    number: 16,
    action: "terminate",
    description: "Stack is empty or overflowed",
    standard: "other"
  },
  {
    name: "SIGCHLD",
    number: 17,
    action: "ignore",
    description: "Child process terminated, paused or unpaused",
    standard: "posix"
  },
  {
    name: "SIGCLD",
    number: 17,
    action: "ignore",
    description: "Child process terminated, paused or unpaused",
    standard: "other"
  },
  {
    name: "SIGCONT",
    number: 18,
    action: "unpause",
    description: "Unpaused",
    standard: "posix",
    forced: true
  },
  {
    name: "SIGSTOP",
    number: 19,
    action: "pause",
    description: "Paused",
    standard: "posix",
    forced: true
  },
  {
    name: "SIGTSTP",
    number: 20,
    action: "pause",
    description: 'Paused using CTRL-Z or "suspend"',
    standard: "posix"
  },
  {
    name: "SIGTTIN",
    number: 21,
    action: "pause",
    description: "Background process cannot read terminal input",
    standard: "posix"
  },
  {
    name: "SIGBREAK",
    number: 21,
    action: "terminate",
    description: "User interruption with CTRL-BREAK",
    standard: "other"
  },
  {
    name: "SIGTTOU",
    number: 22,
    action: "pause",
    description: "Background process cannot write to terminal output",
    standard: "posix"
  },
  {
    name: "SIGURG",
    number: 23,
    action: "ignore",
    description: "Socket received out-of-band data",
    standard: "bsd"
  },
  {
    name: "SIGXCPU",
    number: 24,
    action: "core",
    description: "Process timed out",
    standard: "bsd"
  },
  {
    name: "SIGXFSZ",
    number: 25,
    action: "core",
    description: "File too big",
    standard: "bsd"
  },
  {
    name: "SIGVTALRM",
    number: 26,
    action: "terminate",
    description: "Timeout or timer",
    standard: "bsd"
  },
  {
    name: "SIGPROF",
    number: 27,
    action: "terminate",
    description: "Timeout or timer",
    standard: "bsd"
  },
  {
    name: "SIGWINCH",
    number: 28,
    action: "ignore",
    description: "Terminal window size changed",
    standard: "bsd"
  },
  {
    name: "SIGIO",
    number: 29,
    action: "terminate",
    description: "I/O is available",
    standard: "other"
  },
  {
    name: "SIGPOLL",
    number: 29,
    action: "terminate",
    description: "Watched event",
    standard: "other"
  },
  {
    name: "SIGINFO",
    number: 29,
    action: "ignore",
    description: "Request for process information",
    standard: "other"
  },
  {
    name: "SIGPWR",
    number: 30,
    action: "terminate",
    description: "Device running out of power",
    standard: "systemv"
  },
  {
    name: "SIGSYS",
    number: 31,
    action: "core",
    description: "Invalid system call",
    standard: "other"
  },
  {
    name: "SIGUNUSED",
    number: 31,
    action: "terminate",
    description: "Invalid system call",
    standard: "other"
  }
];

// node_modules/human-signals/build/src/signals.js
var getSignals = () => {
  const realtimeSignals = getRealtimeSignals();
  const signals2 = [...SIGNALS, ...realtimeSignals].map(normalizeSignal);
  return signals2;
};
var normalizeSignal = ({
  name,
  number: defaultNumber,
  description,
  action,
  forced = false,
  standard
}) => {
  const {
    signals: { [name]: constantSignal }
  } = constants2;
  const supported = constantSignal !== void 0;
  const number = supported ? constantSignal : defaultNumber;
  return { name, number, description, supported, action, forced, standard };
};

// node_modules/human-signals/build/src/main.js
var getSignalsByName = () => {
  const signals2 = getSignals();
  return Object.fromEntries(signals2.map(getSignalByName));
};
var getSignalByName = ({
  name,
  number,
  description,
  supported,
  action,
  forced,
  standard
}) => [name, { name, number, description, supported, action, forced, standard }];
var signalsByName = getSignalsByName();
var getSignalsByNumber = () => {
  const signals2 = getSignals();
  const length = SIGRTMAX + 1;
  const signalsA = Array.from(
    { length },
    (value, number) => getSignalByNumber(number, signals2)
  );
  return Object.assign({}, ...signalsA);
};
var getSignalByNumber = (number, signals2) => {
  const signal = findSignalByNumber(number, signals2);
  if (signal === void 0) {
    return {};
  }
  const { name, description, supported, action, forced, standard } = signal;
  return {
    [number]: {
      name,
      number,
      description,
      supported,
      action,
      forced,
      standard
    }
  };
};
var findSignalByNumber = (number, signals2) => {
  const signal = signals2.find(({ name }) => constants3.signals[name] === number);
  if (signal !== void 0) {
    return signal;
  }
  return signals2.find((signalA) => signalA.number === number);
};
var signalsByNumber = getSignalsByNumber();

// node_modules/execa/lib/terminate/signal.js
var normalizeKillSignal = (killSignal) => {
  const optionName = "option `killSignal`";
  if (killSignal === 0) {
    throw new TypeError(`Invalid ${optionName}: 0 cannot be used.`);
  }
  return normalizeSignal2(killSignal, optionName);
};
var normalizeSignalArgument = (signal) => signal === 0 ? signal : normalizeSignal2(signal, "`subprocess.kill()`'s argument");
var normalizeSignal2 = (signalNameOrInteger, optionName) => {
  if (Number.isInteger(signalNameOrInteger)) {
    return normalizeSignalInteger(signalNameOrInteger, optionName);
  }
  if (typeof signalNameOrInteger === "string") {
    return normalizeSignalName(signalNameOrInteger, optionName);
  }
  throw new TypeError(`Invalid ${optionName} ${String(signalNameOrInteger)}: it must be a string or an integer.
${getAvailableSignals()}`);
};
var normalizeSignalInteger = (signalInteger, optionName) => {
  if (signalsIntegerToName.has(signalInteger)) {
    return signalsIntegerToName.get(signalInteger);
  }
  throw new TypeError(`Invalid ${optionName} ${signalInteger}: this signal integer does not exist.
${getAvailableSignals()}`);
};
var getSignalsIntegerToName = () => new Map(Object.entries(constants4.signals).reverse().map(([signalName, signalInteger]) => [signalInteger, signalName]));
var signalsIntegerToName = getSignalsIntegerToName();
var normalizeSignalName = (signalName, optionName) => {
  if (signalName in constants4.signals) {
    return signalName;
  }
  if (signalName.toUpperCase() in constants4.signals) {
    throw new TypeError(`Invalid ${optionName} '${signalName}': please rename it to '${signalName.toUpperCase()}'.`);
  }
  throw new TypeError(`Invalid ${optionName} '${signalName}': this signal name does not exist.
${getAvailableSignals()}`);
};
var getAvailableSignals = () => `Available signal names: ${getAvailableSignalNames()}.
Available signal numbers: ${getAvailableSignalIntegers()}.`;
var getAvailableSignalNames = () => Object.keys(constants4.signals).sort().map((signalName) => `'${signalName}'`).join(", ");
var getAvailableSignalIntegers = () => [...new Set(Object.values(constants4.signals).sort((signalInteger, signalIntegerTwo) => signalInteger - signalIntegerTwo))].join(", ");
var getSignalDescription = (signal) => signalsByName[signal].description;

// node_modules/execa/lib/terminate/kill.js
var normalizeForceKillAfterDelay = (forceKillAfterDelay) => {
  if (forceKillAfterDelay === false) {
    return forceKillAfterDelay;
  }
  if (forceKillAfterDelay === true) {
    return DEFAULT_FORCE_KILL_TIMEOUT;
  }
  if (!Number.isFinite(forceKillAfterDelay) || forceKillAfterDelay < 0) {
    throw new TypeError(`Expected the \`forceKillAfterDelay\` option to be a non-negative integer, got \`${forceKillAfterDelay}\` (${typeof forceKillAfterDelay})`);
  }
  return forceKillAfterDelay;
};
var DEFAULT_FORCE_KILL_TIMEOUT = 1e3 * 5;
var subprocessKill = ({ kill, options: { forceKillAfterDelay, killSignal }, onInternalError, context, controller }, signalOrError, errorArgument) => {
  const { signal, error } = parseKillArguments(signalOrError, errorArgument, killSignal);
  emitKillError(error, onInternalError);
  const killResult = kill(signal);
  setKillTimeout({
    kill,
    signal,
    forceKillAfterDelay,
    killSignal,
    killResult,
    context,
    controller
  });
  return killResult;
};
var parseKillArguments = (signalOrError, errorArgument, killSignal) => {
  const [signal = killSignal, error] = isErrorInstance(signalOrError) ? [void 0, signalOrError] : [signalOrError, errorArgument];
  if (typeof signal !== "string" && !Number.isInteger(signal)) {
    throw new TypeError(`The first argument must be an error instance or a signal name string/integer: ${String(signal)}`);
  }
  if (error !== void 0 && !isErrorInstance(error)) {
    throw new TypeError(`The second argument is optional. If specified, it must be an error instance: ${error}`);
  }
  return { signal: normalizeSignalArgument(signal), error };
};
var emitKillError = (error, onInternalError) => {
  if (error !== void 0) {
    onInternalError.reject(error);
  }
};
var setKillTimeout = async ({ kill, signal, forceKillAfterDelay, killSignal, killResult, context, controller }) => {
  if (signal === killSignal && killResult) {
    killOnTimeout({
      kill,
      forceKillAfterDelay,
      context,
      controllerSignal: controller.signal
    });
  }
};
var killOnTimeout = async ({ kill, forceKillAfterDelay, context, controllerSignal }) => {
  if (forceKillAfterDelay === false) {
    return;
  }
  try {
    await setTimeout2(forceKillAfterDelay, void 0, { signal: controllerSignal });
    if (kill("SIGKILL")) {
      context.isForcefullyTerminated ??= true;
    }
  } catch {
  }
};

// node_modules/execa/lib/utils/abort-signal.js
import { once } from "node:events";
var onAbortedSignal = async (mainSignal, stopSignal) => {
  if (!mainSignal.aborted) {
    await once(mainSignal, "abort", { signal: stopSignal });
  }
};

// node_modules/execa/lib/terminate/cancel.js
var validateCancelSignal = ({ cancelSignal }) => {
  if (cancelSignal !== void 0 && Object.prototype.toString.call(cancelSignal) !== "[object AbortSignal]") {
    throw new Error(`The \`cancelSignal\` option must be an AbortSignal: ${String(cancelSignal)}`);
  }
};
var throwOnCancel = ({ kill, cancelSignal, gracefulCancel, context, controller }) => cancelSignal === void 0 || gracefulCancel ? [] : [terminateOnCancel(kill, cancelSignal, context, controller)];
var terminateOnCancel = async (kill, cancelSignal, context, { signal }) => {
  await onAbortedSignal(cancelSignal, signal);
  context.terminationReason ??= "cancel";
  kill();
  throw cancelSignal.reason;
};

// node_modules/execa/lib/ipc/graceful.js
import { scheduler as scheduler2 } from "node:timers/promises";

// node_modules/execa/lib/ipc/send.js
import { promisify as promisify2 } from "node:util";

// node_modules/execa/lib/ipc/validation.js
var validateIpcMethod = ({ methodName, isSubprocess, ipc, isConnected: isConnected2 }) => {
  validateIpcOption(methodName, isSubprocess, ipc);
  validateConnection(methodName, isSubprocess, isConnected2);
};
var validateIpcOption = (methodName, isSubprocess, ipc) => {
  if (!ipc) {
    throw new Error(`${getMethodName(methodName, isSubprocess)} can only be used if the \`ipc\` option is \`true\`.`);
  }
};
var validateConnection = (methodName, isSubprocess, isConnected2) => {
  if (!isConnected2) {
    throw new Error(`${getMethodName(methodName, isSubprocess)} cannot be used: the ${getOtherProcessName(isSubprocess)} has already exited or disconnected.`);
  }
};
var throwOnEarlyDisconnect = (isSubprocess) => {
  throw new Error(`${getMethodName("getOneMessage", isSubprocess)} could not complete: the ${getOtherProcessName(isSubprocess)} exited or disconnected.`);
};
var throwOnStrictDeadlockError = (isSubprocess) => {
  throw new Error(`${getMethodName("sendMessage", isSubprocess)} failed: the ${getOtherProcessName(isSubprocess)} is sending a message too, instead of listening to incoming messages.
This can be fixed by both sending a message and listening to incoming messages at the same time:

const [receivedMessage] = await Promise.all([
	${getMethodName("getOneMessage", isSubprocess)},
	${getMethodName("sendMessage", isSubprocess, "message, {strict: true}")},
]);`);
};
var getStrictResponseError = (error, isSubprocess) => new Error(`${getMethodName("sendMessage", isSubprocess)} failed when sending an acknowledgment response to the ${getOtherProcessName(isSubprocess)}.`, { cause: error });
var throwOnMissingStrict = (isSubprocess) => {
  throw new Error(`${getMethodName("sendMessage", isSubprocess)} failed: the ${getOtherProcessName(isSubprocess)} is not listening to incoming messages.`);
};
var throwOnStrictDisconnect = (isSubprocess) => {
  throw new Error(`${getMethodName("sendMessage", isSubprocess)} failed: the ${getOtherProcessName(isSubprocess)} exited without listening to incoming messages.`);
};
var getAbortDisconnectError = () => new Error(`\`cancelSignal\` aborted: the ${getOtherProcessName(true)} disconnected.`);
var throwOnMissingParent = () => {
  throw new Error("`getCancelSignal()` cannot be used without setting the `cancelSignal` subprocess option.");
};
var handleEpipeError = ({ error, methodName, isSubprocess }) => {
  if (error.code === "EPIPE") {
    throw new Error(`${getMethodName(methodName, isSubprocess)} cannot be used: the ${getOtherProcessName(isSubprocess)} is disconnecting.`, { cause: error });
  }
};
var handleSerializationError = ({ error, methodName, isSubprocess, message }) => {
  if (isSerializationError(error)) {
    throw new Error(`${getMethodName(methodName, isSubprocess)}'s argument type is invalid: the message cannot be serialized: ${String(message)}.`, { cause: error });
  }
};
var isSerializationError = ({ code, message }) => SERIALIZATION_ERROR_CODES.has(code) || SERIALIZATION_ERROR_MESSAGES.some((serializationErrorMessage) => message.includes(serializationErrorMessage));
var SERIALIZATION_ERROR_CODES = /* @__PURE__ */ new Set([
  // Message is `undefined`
  "ERR_MISSING_ARGS",
  // Message is a function, a bigint, a symbol
  "ERR_INVALID_ARG_TYPE"
]);
var SERIALIZATION_ERROR_MESSAGES = [
  // Message is a promise or a proxy, with `serialization: 'advanced'`
  "could not be cloned",
  // Message has cycles, with `serialization: 'json'`
  "circular structure",
  // Message has cycles inside toJSON(), with `serialization: 'json'`
  "call stack size exceeded"
];
var getMethodName = (methodName, isSubprocess, parameters = "") => methodName === "cancelSignal" ? "`cancelSignal`'s `controller.abort()`" : `${getNamespaceName(isSubprocess)}${methodName}(${parameters})`;
var getNamespaceName = (isSubprocess) => isSubprocess ? "" : "subprocess.";
var getOtherProcessName = (isSubprocess) => isSubprocess ? "parent process" : "subprocess";
var disconnect = (anyProcess) => {
  if (anyProcess.connected) {
    anyProcess.disconnect();
  }
};

// node_modules/execa/lib/utils/deferred.js
var createDeferred = () => {
  const methods = {};
  const promise = new Promise((resolve, reject) => {
    Object.assign(methods, { resolve, reject });
  });
  return Object.assign(promise, methods);
};

// node_modules/execa/lib/ipc/strict.js
import { once as once3 } from "node:events";

// node_modules/execa/lib/utils/max-listeners.js
import { addAbortListener } from "node:events";
var incrementMaxListeners = (eventEmitter, maxListenersIncrement, signal) => {
  const maxListeners = eventEmitter.getMaxListeners();
  if (maxListeners === 0 || maxListeners === Infinity) {
    return;
  }
  eventEmitter.setMaxListeners(maxListeners + maxListenersIncrement);
  addAbortListener(signal, () => {
    eventEmitter.setMaxListeners(eventEmitter.getMaxListeners() - maxListenersIncrement);
  });
};

// node_modules/execa/lib/ipc/forward.js
import { EventEmitter } from "node:events";

// node_modules/execa/lib/ipc/incoming.js
import { once as once2 } from "node:events";
import { scheduler } from "node:timers/promises";

// node_modules/execa/lib/ipc/reference.js
var addReference = (channel, reference) => {
  if (reference) {
    addReferenceCount(channel);
  }
};
var addReferenceCount = (channel) => {
  channel.refCounted();
};
var removeReference = (channel, reference) => {
  if (reference) {
    removeReferenceCount(channel);
  }
};
var removeReferenceCount = (channel) => {
  channel.unrefCounted();
};
var undoAddedReferences = (channel, isSubprocess) => {
  if (!isSubprocess) {
    return;
  }
  removeReferenceCount(channel);
  removeReferenceCount(channel);
};
var redoAddedReferences = (channel, isSubprocess) => {
  if (!isSubprocess) {
    return;
  }
  addReferenceCount(channel);
  addReferenceCount(channel);
};

// node_modules/execa/lib/ipc/incoming.js
var onMessage = async ({ anyProcess, channel, isSubprocess, ipcEmitter }, wrappedMessage) => {
  if (handleStrictResponse(wrappedMessage) || handleAbort(wrappedMessage)) {
    return;
  }
  if (!INCOMING_MESSAGES.has(anyProcess)) {
    INCOMING_MESSAGES.set(anyProcess, []);
  }
  const incomingMessages = INCOMING_MESSAGES.get(anyProcess);
  incomingMessages.push(wrappedMessage);
  if (incomingMessages.length > 1) {
    return;
  }
  while (incomingMessages.length > 0) {
    await waitForOutgoingMessages(anyProcess, ipcEmitter, wrappedMessage);
    await scheduler.yield();
    const message = await handleStrictRequest({
      wrappedMessage: incomingMessages[0],
      anyProcess,
      channel,
      isSubprocess,
      ipcEmitter
    });
    incomingMessages.shift();
    ipcEmitter.emit("message", message);
    ipcEmitter.emit("message:done");
  }
};
var onDisconnect = async ({ anyProcess, channel, isSubprocess, ipcEmitter, boundOnMessage }) => {
  abortOnDisconnect();
  const incomingMessages = INCOMING_MESSAGES.get(anyProcess);
  while (incomingMessages?.length > 0) {
    await once2(ipcEmitter, "message:done");
  }
  anyProcess.removeListener("message", boundOnMessage);
  redoAddedReferences(channel, isSubprocess);
  ipcEmitter.connected = false;
  ipcEmitter.emit("disconnect");
};
var INCOMING_MESSAGES = /* @__PURE__ */ new WeakMap();

// node_modules/execa/lib/ipc/forward.js
var getIpcEmitter = (anyProcess, channel, isSubprocess) => {
  if (IPC_EMITTERS.has(anyProcess)) {
    return IPC_EMITTERS.get(anyProcess);
  }
  const ipcEmitter = new EventEmitter();
  ipcEmitter.connected = true;
  IPC_EMITTERS.set(anyProcess, ipcEmitter);
  forwardEvents({
    ipcEmitter,
    anyProcess,
    channel,
    isSubprocess
  });
  return ipcEmitter;
};
var IPC_EMITTERS = /* @__PURE__ */ new WeakMap();
var forwardEvents = ({ ipcEmitter, anyProcess, channel, isSubprocess }) => {
  const boundOnMessage = onMessage.bind(void 0, {
    anyProcess,
    channel,
    isSubprocess,
    ipcEmitter
  });
  anyProcess.on("message", boundOnMessage);
  anyProcess.once("disconnect", onDisconnect.bind(void 0, {
    anyProcess,
    channel,
    isSubprocess,
    ipcEmitter,
    boundOnMessage
  }));
  undoAddedReferences(channel, isSubprocess);
};
var isConnected = (anyProcess) => {
  const ipcEmitter = IPC_EMITTERS.get(anyProcess);
  return ipcEmitter === void 0 ? anyProcess.channel !== void 0 && anyProcess.channel !== null : ipcEmitter.connected;
};

// node_modules/execa/lib/ipc/strict.js
var handleSendStrict = ({ anyProcess, channel, isSubprocess, message, strict }) => {
  if (!strict) {
    return message;
  }
  const ipcEmitter = getIpcEmitter(anyProcess, channel, isSubprocess);
  const hasListeners = hasMessageListeners(anyProcess, ipcEmitter);
  return {
    id: count++,
    type: REQUEST_TYPE,
    message,
    hasListeners
  };
};
var count = 0n;
var validateStrictDeadlock = (outgoingMessages, wrappedMessage) => {
  if (wrappedMessage?.type !== REQUEST_TYPE || wrappedMessage.hasListeners) {
    return;
  }
  for (const { id } of outgoingMessages) {
    if (id !== void 0) {
      STRICT_RESPONSES[id].resolve({ isDeadlock: true, hasListeners: false });
    }
  }
};
var handleStrictRequest = async ({ wrappedMessage, anyProcess, channel, isSubprocess, ipcEmitter }) => {
  if (wrappedMessage?.type !== REQUEST_TYPE || !anyProcess.connected) {
    return wrappedMessage;
  }
  const { id, message } = wrappedMessage;
  const response = { id, type: RESPONSE_TYPE, message: hasMessageListeners(anyProcess, ipcEmitter) };
  try {
    await sendMessage({
      anyProcess,
      channel,
      isSubprocess,
      ipc: true
    }, response);
  } catch (error) {
    ipcEmitter.emit("strict:error", error);
  }
  return message;
};
var handleStrictResponse = (wrappedMessage) => {
  if (wrappedMessage?.type !== RESPONSE_TYPE) {
    return false;
  }
  const { id, message: hasListeners } = wrappedMessage;
  STRICT_RESPONSES[id]?.resolve({ isDeadlock: false, hasListeners });
  return true;
};
var waitForStrictResponse = async (wrappedMessage, anyProcess, isSubprocess) => {
  if (wrappedMessage?.type !== REQUEST_TYPE) {
    return;
  }
  const deferred = createDeferred();
  STRICT_RESPONSES[wrappedMessage.id] = deferred;
  const controller = new AbortController();
  try {
    const { isDeadlock, hasListeners } = await Promise.race([
      deferred,
      throwOnDisconnect(anyProcess, isSubprocess, controller)
    ]);
    if (isDeadlock) {
      throwOnStrictDeadlockError(isSubprocess);
    }
    if (!hasListeners) {
      throwOnMissingStrict(isSubprocess);
    }
  } finally {
    controller.abort();
    delete STRICT_RESPONSES[wrappedMessage.id];
  }
};
var STRICT_RESPONSES = {};
var throwOnDisconnect = async (anyProcess, isSubprocess, { signal }) => {
  incrementMaxListeners(anyProcess, 1, signal);
  await once3(anyProcess, "disconnect", { signal });
  throwOnStrictDisconnect(isSubprocess);
};
var REQUEST_TYPE = "execa:ipc:request";
var RESPONSE_TYPE = "execa:ipc:response";

// node_modules/execa/lib/ipc/outgoing.js
var startSendMessage = (anyProcess, wrappedMessage, strict) => {
  if (!OUTGOING_MESSAGES.has(anyProcess)) {
    OUTGOING_MESSAGES.set(anyProcess, /* @__PURE__ */ new Set());
  }
  const outgoingMessages = OUTGOING_MESSAGES.get(anyProcess);
  const onMessageSent = createDeferred();
  const id = strict ? wrappedMessage.id : void 0;
  const outgoingMessage = { onMessageSent, id };
  outgoingMessages.add(outgoingMessage);
  return { outgoingMessages, outgoingMessage };
};
var endSendMessage = ({ outgoingMessages, outgoingMessage }) => {
  outgoingMessages.delete(outgoingMessage);
  outgoingMessage.onMessageSent.resolve();
};
var waitForOutgoingMessages = async (anyProcess, ipcEmitter, wrappedMessage) => {
  while (!hasMessageListeners(anyProcess, ipcEmitter) && OUTGOING_MESSAGES.get(anyProcess)?.size > 0) {
    const outgoingMessages = [...OUTGOING_MESSAGES.get(anyProcess)];
    validateStrictDeadlock(outgoingMessages, wrappedMessage);
    await Promise.all(outgoingMessages.map(({ onMessageSent }) => onMessageSent));
  }
};
var OUTGOING_MESSAGES = /* @__PURE__ */ new WeakMap();
var IPC_SUBPROCESS_OPTIONS = /* @__PURE__ */ new WeakMap();
var setIpcSubprocessOptions = (subprocess, options) => {
  IPC_SUBPROCESS_OPTIONS.set(subprocess, options);
};
var hasMessageListeners = (anyProcess, ipcEmitter) => ipcEmitter.listenerCount("message") > getMinListenerCount(anyProcess);
var getMinListenerCount = (anyProcess) => getOptions(anyProcess) !== void 0 && !getFdSpecificValue(getOptions(anyProcess).buffer, "ipc") ? 1 : 0;
var getOptions = (anyProcess) => IPC_SUBPROCESS_OPTIONS.get(anyProcess);

// node_modules/execa/lib/ipc/send.js
var sendMessage = ({ anyProcess, channel, isSubprocess, ipc }, message, { strict = false } = {}) => {
  const methodName = "sendMessage";
  validateIpcMethod({
    methodName,
    isSubprocess,
    ipc,
    isConnected: anyProcess.connected
  });
  return sendMessageAsync({
    anyProcess,
    channel,
    methodName,
    isSubprocess,
    message,
    strict
  });
};
var sendMessageAsync = async ({ anyProcess, channel, methodName, isSubprocess, message, strict }) => {
  const wrappedMessage = handleSendStrict({
    anyProcess,
    channel,
    isSubprocess,
    message,
    strict
  });
  const outgoingMessagesState = startSendMessage(anyProcess, wrappedMessage, strict);
  try {
    await sendOneMessage({
      anyProcess,
      methodName,
      isSubprocess,
      wrappedMessage,
      message
    });
  } catch (error) {
    disconnect(anyProcess);
    throw error;
  } finally {
    endSendMessage(outgoingMessagesState);
  }
};
var sendOneMessage = async ({ anyProcess, methodName, isSubprocess, wrappedMessage, message }) => {
  const sendMethod = getSendMethod(anyProcess);
  try {
    await Promise.all([
      waitForStrictResponse(wrappedMessage, anyProcess, isSubprocess),
      sendMethod(wrappedMessage)
    ]);
  } catch (error) {
    handleEpipeError({ error, methodName, isSubprocess });
    handleSerializationError({
      error,
      methodName,
      isSubprocess,
      message
    });
    throw error;
  }
};
var getSendMethod = (anyProcess) => {
  if (PROCESS_SEND_METHODS.has(anyProcess)) {
    return PROCESS_SEND_METHODS.get(anyProcess);
  }
  const sendMethod = promisify2(anyProcess.send.bind(anyProcess));
  PROCESS_SEND_METHODS.set(anyProcess, sendMethod);
  return sendMethod;
};
var PROCESS_SEND_METHODS = /* @__PURE__ */ new WeakMap();

// node_modules/execa/lib/ipc/graceful.js
var sendAbort = (subprocess, message) => {
  const methodName = "cancelSignal";
  validateConnection(methodName, false, subprocess.connected);
  return sendOneMessage({
    anyProcess: subprocess,
    methodName,
    isSubprocess: false,
    wrappedMessage: { type: GRACEFUL_CANCEL_TYPE, message },
    message
  });
};
var getCancelSignal = async ({ anyProcess, channel, isSubprocess, ipc }) => {
  await startIpc({
    anyProcess,
    channel,
    isSubprocess,
    ipc
  });
  return cancelController.signal;
};
var startIpc = async ({ anyProcess, channel, isSubprocess, ipc }) => {
  if (isCancelListening) {
    return;
  }
  isCancelListening = true;
  if (!ipc) {
    throwOnMissingParent();
    return;
  }
  if (channel === null) {
    abortOnDisconnect();
    return;
  }
  getIpcEmitter(anyProcess, channel, isSubprocess);
  await scheduler2.yield();
};
var isCancelListening = false;
var handleAbort = (wrappedMessage) => {
  if (wrappedMessage?.type !== GRACEFUL_CANCEL_TYPE) {
    return false;
  }
  cancelController.abort(wrappedMessage.message);
  return true;
};
var GRACEFUL_CANCEL_TYPE = "execa:ipc:cancel";
var abortOnDisconnect = () => {
  cancelController.abort(getAbortDisconnectError());
};
var cancelController = new AbortController();

// node_modules/execa/lib/terminate/graceful.js
var validateGracefulCancel = ({ gracefulCancel, cancelSignal, ipc, serialization }) => {
  if (!gracefulCancel) {
    return;
  }
  if (cancelSignal === void 0) {
    throw new Error("The `cancelSignal` option must be defined when setting the `gracefulCancel` option.");
  }
  if (!ipc) {
    throw new Error("The `ipc` option cannot be false when setting the `gracefulCancel` option.");
  }
  if (serialization === "json") {
    throw new Error("The `serialization` option cannot be 'json' when setting the `gracefulCancel` option.");
  }
};
var throwOnGracefulCancel = ({
  subprocess,
  kill,
  cancelSignal,
  gracefulCancel,
  forceKillAfterDelay,
  context,
  controller
}) => gracefulCancel ? [sendOnAbort({
  subprocess,
  kill,
  cancelSignal,
  forceKillAfterDelay,
  context,
  controller
})] : [];
var sendOnAbort = async ({ subprocess, kill, cancelSignal, forceKillAfterDelay, context, controller: { signal } }) => {
  await onAbortedSignal(cancelSignal, signal);
  const reason = getReason(cancelSignal);
  await sendAbort(subprocess, reason);
  killOnTimeout({
    kill,
    forceKillAfterDelay,
    context,
    controllerSignal: signal
  });
  context.terminationReason ??= "gracefulCancel";
  throw cancelSignal.reason;
};
var getReason = ({ reason }) => {
  if (!(reason instanceof DOMException)) {
    return reason;
  }
  const error = new Error(reason.message);
  Object.defineProperty(error, "stack", {
    value: reason.stack,
    enumerable: false,
    configurable: true,
    writable: true
  });
  return error;
};

// node_modules/execa/lib/terminate/timeout.js
import { setTimeout as setTimeout3 } from "node:timers/promises";
var validateTimeout = ({ timeout }) => {
  if (timeout !== void 0 && (!Number.isFinite(timeout) || timeout < 0)) {
    throw new TypeError(`Expected the \`timeout\` option to be a non-negative integer, got \`${timeout}\` (${typeof timeout})`);
  }
};
var throwOnTimeout = (kill, timeout, context, controller) => timeout === 0 || timeout === void 0 ? [] : [killAfterTimeout(kill, timeout, context, controller)];
var killAfterTimeout = async (kill, timeout, context, { signal }) => {
  await setTimeout3(timeout, void 0, { signal });
  context.terminationReason ??= "timeout";
  kill();
  throw new DiscardedError();
};

// node_modules/execa/lib/methods/node.js
import { execPath, execArgv } from "node:process";
import path4 from "node:path";
var mapNode = ({ options }) => {
  if (options.node === false) {
    throw new TypeError('The "node" option cannot be false with `execaNode()`.');
  }
  return { options: { ...options, node: true } };
};
var handleNodeOption = (file, commandArguments, {
  node: shouldHandleNode = false,
  nodePath = execPath,
  nodeOptions = execArgv.filter((nodeOption) => !nodeOption.startsWith("--inspect")),
  cwd,
  execPath: formerNodePath,
  ...options
}) => {
  if (formerNodePath !== void 0) {
    throw new TypeError('The "execPath" option has been removed. Please use the "nodePath" option instead.');
  }
  const normalizedNodePath = safeNormalizeFileUrl(nodePath, 'The "nodePath" option');
  const resolvedNodePath = path4.resolve(cwd, normalizedNodePath);
  const newOptions = {
    __proto__: null,
    shell: false,
    ...options,
    nodePath: resolvedNodePath,
    node: shouldHandleNode,
    cwd
  };
  if (!shouldHandleNode) {
    return [file, commandArguments, newOptions];
  }
  if (path4.basename(file, ".exe") === "node") {
    throw new TypeError('When the "node" option is true, the first argument does not need to be "node".');
  }
  return [
    resolvedNodePath,
    [
      ...nodeOptions,
      file,
      ...commandArguments
    ],
    {
      __proto__: null,
      ipc: true,
      ...newOptions,
      shell: false
    }
  ];
};

// node_modules/execa/lib/ipc/ipc-input.js
import { serialize } from "node:v8";
var validateIpcInputOption = ({ ipcInput, ipc, serialization }) => {
  if (ipcInput === void 0) {
    return;
  }
  if (!ipc) {
    throw new Error("The `ipcInput` option cannot be set unless the `ipc` option is `true`.");
  }
  validateIpcInput[serialization](ipcInput);
};
var validateAdvancedInput = (ipcInput) => {
  try {
    serialize(ipcInput);
  } catch (error) {
    throw new Error("The `ipcInput` option is not serializable with a structured clone.", { cause: error });
  }
};
var validateJsonInput = (ipcInput) => {
  try {
    JSON.stringify(ipcInput);
  } catch (error) {
    throw new Error("The `ipcInput` option is not serializable with JSON.", { cause: error });
  }
};
var validateIpcInput = {
  advanced: validateAdvancedInput,
  json: validateJsonInput
};
var sendIpcInput = async (subprocess, ipcInput, ipc) => {
  if (ipcInput === void 0) {
    return;
  }
  await sendMessage({
    anyProcess: subprocess,
    channel: subprocess.channel,
    isSubprocess: false,
    ipc
  }, ipcInput);
};

// node_modules/execa/lib/arguments/encoding-option.js
var validateEncoding = ({ encoding }) => {
  if (ENCODINGS.has(encoding)) {
    return;
  }
  const correctEncoding = getCorrectEncoding(encoding);
  if (correctEncoding !== void 0) {
    throw new TypeError(`Invalid option \`encoding: ${serializeEncoding(encoding)}\`.
Please rename it to ${serializeEncoding(correctEncoding)}.`);
  }
  const correctEncodings = [...ENCODINGS].map((correctEncoding2) => serializeEncoding(correctEncoding2)).join(", ");
  throw new TypeError(`Invalid option \`encoding: ${serializeEncoding(encoding)}\`.
Please rename it to one of: ${correctEncodings}.`);
};
var TEXT_ENCODINGS = /* @__PURE__ */ new Set(["utf8", "utf16le"]);
var BINARY_ENCODINGS = /* @__PURE__ */ new Set(["buffer", "hex", "base64", "base64url", "latin1", "ascii"]);
var ENCODINGS = TEXT_ENCODINGS.union(BINARY_ENCODINGS);
var getCorrectEncoding = (encoding) => {
  if (encoding === null) {
    return "buffer";
  }
  if (typeof encoding !== "string") {
    return;
  }
  const lowerEncoding = encoding.toLowerCase();
  if (lowerEncoding in ENCODING_ALIASES) {
    return ENCODING_ALIASES[lowerEncoding];
  }
  if (ENCODINGS.has(lowerEncoding)) {
    return lowerEncoding;
  }
};
var ENCODING_ALIASES = {
  // eslint-disable-next-line unicorn/text-encoding-identifier-case
  "utf-8": "utf8",
  "utf-16le": "utf16le",
  "ucs-2": "utf16le",
  ucs2: "utf16le",
  binary: "latin1"
};
var serializeEncoding = (encoding) => typeof encoding === "string" ? `"${encoding}"` : String(encoding);

// node_modules/execa/lib/arguments/command-file.js
import { openSync, readSync, closeSync } from "node:fs";
import { Buffer as Buffer2 } from "node:buffer";
import path6 from "node:path";
import process6 from "node:process";

// node_modules/which-command/index.js
import fs from "node:fs";
import path5 from "node:path";
import process5 from "node:process";
var isWindows = process5.platform === "win32";
var separatorPattern = isWindows ? new RegExp("[\\/\\\\]", "v") : new RegExp("\\/", "v");
var defaultPathExt = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";
function resolveOptions(command, options) {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("Expected a non-empty string.");
  }
  const {
    cwd = process5.cwd(),
    // On Windows, `process.env.PATH` can be undefined in some contexts (for example, worker threads), where it's only exposed as `Path`.
    path: searchPath = process5.env.PATH ?? (isWindows ? process5.env.Path : void 0) ?? "",
    // `||` (not `??`) so an empty `PATHEXT` falls back to the default instead of disabling all lookup on Windows.
    pathExt = process5.env.PATHEXT || defaultPathExt
  } = options;
  return { cwd, searchPath, pathExt };
}
function windowsExtensions(command, pathExt) {
  const extensions = pathExt.split(path5.delimiter).filter(Boolean);
  const commandExtension = path5.extname(command).toLowerCase();
  if (commandExtension !== "" && extensions.some((extension) => extension.toLowerCase() === commandExtension)) {
    return ["", ...extensions];
  }
  return extensions;
}
function* candidatePaths(command, { cwd, searchPath, pathExt }) {
  const extensions = isWindows ? windowsExtensions(command, pathExt) : [""];
  if (separatorPattern.test(command)) {
    const base = path5.resolve(cwd, command);
    for (const extension of extensions) {
      yield base + extension;
    }
    return;
  }
  const directories = [
    // Windows searches the current directory before `PATH`.
    ...isWindows ? [cwd] : [],
    ...searchPath.split(path5.delimiter)
  ];
  for (const directory of directories) {
    const unquoted = isWindows && directory.length > 1 && directory.startsWith('"') && directory.endsWith('"') ? directory.slice(1, -1) : directory;
    if (unquoted === "") {
      continue;
    }
    const base = path5.resolve(cwd, unquoted, command);
    for (const extension of extensions) {
      yield base + extension;
    }
  }
}
function isExecutableSync(filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    return isWindows && error.code === "EACCES";
  }
  if (!stats.isFile()) {
    return false;
  }
  if (isWindows) {
    return true;
  }
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function whichCommandSync(command, options = {}) {
  const resolved = resolveOptions(command, options);
  for (const candidate of candidatePaths(command, resolved)) {
    if (isExecutableSync(candidate)) {
      return candidate;
    }
  }
  return void 0;
}

// node_modules/execa/lib/arguments/command-file.js
var parseCommandFile = (file, commandArguments, options) => {
  const parsed = { file, commandArguments: [...commandArguments], options };
  if (options.shell || process6.platform !== "win32") {
    return parsed;
  }
  return escapeWindowsCommand(parsed);
};
var directlyExecutableRegExp = /\.(?:com|exe)$/i;
var batchFileRegExp = /\.(?:bat|cmd)$/i;
var escapeWindowsCommand = (parsed) => {
  const resolvedFile = resolveWithShebang(parsed);
  if (resolvedFile !== void 0 && directlyExecutableRegExp.test(resolvedFile)) {
    if (parsed.options.argv0 === void 0) {
      parsed.options.argv0 = parsed.file;
    }
    parsed.file = resolvedFile;
    return parsed;
  }
  for (const value of [parsed.file, ...parsed.commandArguments]) {
    assertNoLineBreak(value);
  }
  const isDoubleEscape = resolvedFile !== void 0 && batchFileRegExp.test(resolvedFile);
  const escapedFile = escapeMetaChars(path6.normalize(resolvedFile ?? parsed.file));
  const escapedArguments = parsed.commandArguments.map((argument) => escapeArgument(argument, isDoubleEscape));
  const commandLine = `"${[escapedFile, ...escapedArguments].join(" ")}"`;
  parsed.options.windowsVerbatimArguments = true;
  return {
    file: process6.env.comspec || "cmd.exe",
    commandArguments: ["/d", "/s", "/c", commandLine],
    options: parsed.options
  };
};
var resolveWithShebang = (parsed) => {
  const resolvedFile = resolvePath(parsed);
  const interpreter = resolvedFile !== void 0 && readShebang(resolvedFile);
  if (!interpreter) {
    return resolvedFile;
  }
  parsed.commandArguments.unshift(resolvedFile);
  parsed.file = interpreter;
  return resolvePath(parsed);
};
var resolvePath = (parsed) => {
  const environment = parsed.options.env || process6.env;
  const cwd = parsed.options.cwd ?? process6.cwd();
  const environmentPathExt = getWindowsEnvironmentValue(environment, "PATHEXT");
  const commandExtension = path6.extname(parsed.file);
  const pathExt = commandExtension === "" ? environmentPathExt : `${commandExtension}${path6.delimiter}${environmentPathExt ?? ""}`;
  if (hasWindowsPathSeparator(parsed.file)) {
    return whichCommandSync(path6.resolve(cwd, parsed.file), { cwd, pathExt });
  }
  const searchPath = getWindowsEnvironmentValue(environment, "PATH") ?? getWindowsEnvironmentValue(process6.env, "PATH") ?? "";
  const resolveOptions2 = {
    cwd,
    path: searchPath,
    pathExt
  };
  return shouldSearchCurrentDirectory(environment) ? whichCommandSync(parsed.file, resolveOptions2) : resolvePathDirectories(parsed.file, resolveOptions2);
};
var hasWindowsPathSeparator = (file) => file.includes("/") || file.includes("\\") || file.includes(":");
var shouldSearchCurrentDirectory = (environment) => getWindowsEnvironmentValue(process6.env, "NODEFAULTCURRENTDIRECTORYINEXEPATH") === void 0 && getWindowsEnvironmentValue(environment, "NODEFAULTCURRENTDIRECTORYINEXEPATH") === void 0;
var resolvePathDirectories = (file, { cwd, path: searchPath, pathExt }) => {
  for (const directory of searchPath.split(path6.delimiter)) {
    const unquotedDirectory = directory.length > 1 && directory.startsWith('"') && directory.endsWith('"') ? directory.slice(1, -1) : directory;
    if (unquotedDirectory === "") {
      continue;
    }
    const resolvedFile = whichCommandSync(path6.resolve(cwd, unquotedDirectory, file), { cwd, pathExt });
    if (resolvedFile !== void 0) {
      return resolvedFile;
    }
  }
};
var getWindowsEnvironmentValue = (environment, name) => {
  const environmentKey = Object.keys(environment).sort().find((key) => key.toUpperCase() === name);
  return environmentKey === void 0 ? void 0 : environment[environmentKey];
};
var SHEBANG_BYTE_LENGTH = 150;
var readShebang = (file) => {
  const buffer = Buffer2.alloc(SHEBANG_BYTE_LENGTH);
  try {
    const fileDescriptor = openSync(file, "r");
    try {
      readSync(fileDescriptor, buffer, 0, SHEBANG_BYTE_LENGTH, 0);
    } finally {
      closeSync(fileDescriptor);
    }
  } catch {
    return void 0;
  }
  return parseShebang(buffer.toString());
};
var shebangRegExp = /^#!(?<line>.*)/;
var parseShebang = (contents) => {
  const shebangLine = contents.match(shebangRegExp)?.groups.line.trim();
  if (!shebangLine) {
    return void 0;
  }
  const [interpreterPath, argument] = shebangLine.split(" ");
  const interpreter = interpreterPath.split("/").at(-1);
  if (interpreter === "env") {
    return argument;
  }
  return argument ? `${interpreter} ${argument}` : interpreter;
};
var lineBreakRegExp = /[\n\r]/;
var assertNoLineBreak = (value) => {
  if (lineBreakRegExp.test(value)) {
    throw new TypeError(`The command and its arguments cannot contain a line break on Windows without a shell.
This would allow a command injection with \`cmd.exe\`.
Invalid value: ${JSON.stringify(`${value}`)}`);
  }
};
var metaCharsRegExp = /[()\][%!^"`<>&|;, *?]/g;
var escapeMetaChars = (value) => value.replaceAll(metaCharsRegExp, "^$&");
var backslashRunRegExp = /\\+/g;
var escapeArgument = (rawArgument, doubleEscape) => {
  const argument = `${rawArgument}`.replaceAll(backslashRunRegExp, (backslashes, offset, string) => {
    const nextCharacter = string[offset + backslashes.length];
    const isPrecedesDoubleQuote = nextCharacter === '"' || nextCharacter === void 0;
    return isPrecedesDoubleQuote ? backslashes.repeat(2) : backslashes;
  }).replaceAll('"', '\\"');
  const escapedArgument = escapeMetaChars(`"${argument}"`);
  return doubleEscape ? escapeMetaChars(escapedArgument) : escapedArgument;
};

// node_modules/execa/lib/arguments/cwd.js
import { statSync } from "node:fs";
import path7 from "node:path";
import process7 from "node:process";
var normalizeCwd = (cwd = getDefaultCwd()) => {
  const cwdString = safeNormalizeFileUrl(cwd, 'The "cwd" option');
  return path7.resolve(cwdString);
};
var getDefaultCwd = () => {
  try {
    return process7.cwd();
  } catch (error) {
    error.message = `The current directory does not exist.
${error.message}`;
    throw error;
  }
};
var fixCwdError = (originalMessage, cwd) => {
  if (cwd === getDefaultCwd()) {
    return originalMessage;
  }
  let cwdStat;
  try {
    cwdStat = statSync(cwd);
  } catch (error) {
    return `The "cwd" option is invalid: ${cwd}.
${error.message}
${originalMessage}`;
  }
  if (!cwdStat.isDirectory()) {
    return `The "cwd" option is not a directory: ${cwd}.
${originalMessage}`;
  }
  return originalMessage;
};

// node_modules/execa/lib/arguments/options.js
var cmdExeRegExp = /^cmd(?:\.exe)?$/i;
var normalizeOptions = (filePath, rawArguments, rawOptions) => {
  const sanitizedOptions = { __proto__: null, ...rawOptions };
  sanitizedOptions.cwd = normalizeCwd(sanitizedOptions.cwd);
  const [processedFile, processedArguments, processedOptions] = handleNodeOption(filePath, rawArguments, sanitizedOptions);
  const fdOptions = normalizeFdSpecificOptions(processedOptions);
  const options = addDefaultOptions(fdOptions);
  options.env = getEnv(options);
  const { file, commandArguments } = parseCommandFile(processedFile, processedArguments, options);
  validateTimeout(options);
  validateEncoding(options);
  validateIpcInputOption(options);
  validateCancelSignal(options);
  validateGracefulCancel(options);
  options.shell = normalizeFileUrl(options.shell);
  options.killSignal = normalizeKillSignal(options.killSignal);
  options.forceKillAfterDelay = normalizeForceKillAfterDelay(options.forceKillAfterDelay);
  options.lines = options.lines.map((lines, fdNumber) => lines && !BINARY_ENCODINGS.has(options.encoding) && options.buffer[fdNumber]);
  if (process8.platform === "win32" && cmdExeRegExp.test(path8.basename(file))) {
    commandArguments.unshift("/q");
  }
  return { file, commandArguments, options };
};
var addDefaultOptions = ({
  extendEnv = true,
  preferLocal = false,
  cwd,
  localDir: localDirectory = cwd,
  encoding = "utf8",
  reject = true,
  cleanup = true,
  killDescendants = false,
  all = false,
  windowsHide = true,
  killSignal = "SIGTERM",
  forceKillAfterDelay = true,
  gracefulCancel = false,
  ipcInput,
  ipc = ipcInput !== void 0 || gracefulCancel,
  serialization = "advanced",
  ...options
}) => ({
  __proto__: null,
  ...options,
  extendEnv,
  preferLocal,
  cwd,
  localDirectory,
  encoding,
  reject,
  cleanup,
  killDescendants,
  all,
  windowsHide,
  killSignal,
  forceKillAfterDelay,
  gracefulCancel,
  ipcInput,
  ipc,
  serialization
});
var getEnv = ({ env: envOption, extendEnv, preferLocal, node, localDirectory, nodePath }) => {
  const env = extendEnv ? { ...process8.env, ...envOption } : envOption;
  if (preferLocal || node) {
    return npmRunPathEnv({
      env,
      cwd: localDirectory,
      execPath: nodePath,
      preferLocal,
      addExecPath: node
    });
  }
  return env;
};

// node_modules/execa/lib/arguments/shell.js
var concatenateShell = (file, commandArguments, options) => options.shell && commandArguments.length > 0 ? [[file, ...commandArguments].join(" "), [], options] : [file, commandArguments, options];

// node_modules/execa/lib/return/message.js
import { inspect as inspect2 } from "node:util";

// node_modules/strip-final-newline/index.js
function stripFinalNewline(input) {
  if (typeof input === "string") {
    return stripFinalNewlineString(input);
  }
  if (!(ArrayBuffer.isView(input) && input.BYTES_PER_ELEMENT === 1)) {
    throw new Error("Input must be a string or a Uint8Array");
  }
  return stripFinalNewlineBinary(input);
}
var stripFinalNewlineString = (input) => input.at(-1) === LF ? input.slice(0, input.at(-2) === CR ? -2 : -1) : input;
var stripFinalNewlineBinary = (input) => input.at(-1) === LF_BINARY ? input.subarray(0, input.at(-2) === CR_BINARY ? -2 : -1) : input;
var LF = "\n";
var LF_BINARY = LF.codePointAt(0);
var CR = "\r";
var CR_BINARY = CR.codePointAt(0);

// node_modules/get-stream/source/index.js
import { on } from "node:events";
import { finished } from "node:stream/promises";

// node_modules/is-stream/index.js
function isStream(stream, { checkOpen = true } = {}) {
  return stream !== null && typeof stream === "object" && (stream.writable || stream.readable || !checkOpen || stream.writable === void 0 && stream.readable === void 0) && typeof stream.pipe === "function";
}
function isWritableStream(stream, { checkOpen = true } = {}) {
  return isStream(stream, { checkOpen }) && (stream.writable || !checkOpen) && typeof stream.write === "function" && typeof stream.end === "function" && typeof stream.writable === "boolean" && typeof stream.writableObjectMode === "boolean" && typeof stream.destroy === "function" && typeof stream.destroyed === "boolean";
}
function isReadableStream(stream, { checkOpen = true } = {}) {
  return isStream(stream, { checkOpen }) && (stream.readable || !checkOpen) && typeof stream.read === "function" && typeof stream.readable === "boolean" && typeof stream.readableObjectMode === "boolean" && typeof stream.destroy === "function" && typeof stream.destroyed === "boolean";
}
function isDuplexStream(stream, options) {
  return isWritableStream(stream, options) && isReadableStream(stream, options);
}

// node_modules/@sec-ant/readable-stream/dist/ponyfill/asyncIterator.js
var a = Object.getPrototypeOf(
  Object.getPrototypeOf(
    /* istanbul ignore next */
    async function* () {
    }
  ).prototype
);
var c = class {
  #t;
  #n;
  #r = false;
  #e = void 0;
  constructor(e, t) {
    this.#t = e, this.#n = t;
  }
  next() {
    const e = () => this.#s();
    return this.#e = this.#e ? this.#e.then(e, e) : e(), this.#e;
  }
  return(e) {
    const t = () => this.#i(e);
    return this.#e ? this.#e.then(t, t) : t();
  }
  async #s() {
    if (this.#r)
      return {
        done: true,
        value: void 0
      };
    let e;
    try {
      e = await this.#t.read();
    } catch (t) {
      throw this.#e = void 0, this.#r = true, this.#t.releaseLock(), t;
    }
    return e.done && (this.#e = void 0, this.#r = true, this.#t.releaseLock()), e;
  }
  async #i(e) {
    if (this.#r)
      return {
        done: true,
        value: e
      };
    if (this.#r = true, !this.#n) {
      const t = this.#t.cancel(e);
      return this.#t.releaseLock(), await t, {
        done: true,
        value: e
      };
    }
    return this.#t.releaseLock(), {
      done: true,
      value: e
    };
  }
};
var n = /* @__PURE__ */ Symbol();
function i() {
  return this[n].next();
}
Object.defineProperty(i, "name", { value: "next" });
function o(r) {
  return this[n].return(r);
}
Object.defineProperty(o, "name", { value: "return" });
var u = Object.create(a, {
  next: {
    enumerable: true,
    configurable: true,
    writable: true,
    value: i
  },
  return: {
    enumerable: true,
    configurable: true,
    writable: true,
    value: o
  }
});
function h({ preventCancel: r = false } = {}) {
  const e = this.getReader(), t = new c(
    e,
    r
  ), s = Object.create(u);
  return s[n] = t, s;
}

// node_modules/get-stream/source/stream.js
var getAsyncIterable = (stream) => {
  if (isReadableStream(stream, { checkOpen: false }) && nodeImports.on !== void 0) {
    return getStreamIterable(stream);
  }
  if (typeof stream?.[Symbol.asyncIterator] === "function") {
    return stream;
  }
  if (toString.call(stream) === "[object ReadableStream]") {
    return h.call(stream);
  }
  throw new TypeError("The first argument must be a Readable, a ReadableStream, or an async iterable.");
};
var { toString } = Object.prototype;
var getStreamIterable = async function* (stream) {
  const controller = new AbortController();
  const state = {};
  handleStreamEnd(stream, controller, state);
  try {
    for await (const [chunk] of nodeImports.on(stream, "data", { signal: controller.signal })) {
      yield chunk;
    }
  } catch (error) {
    if (state.error !== void 0) {
      throw state.error;
    } else if (!controller.signal.aborted) {
      throw error;
    }
  } finally {
    stream.destroy();
  }
};
var handleStreamEnd = async (stream, controller, state) => {
  try {
    await nodeImports.finished(stream, {
      cleanup: true,
      readable: true,
      writable: false,
      error: false
    });
  } catch (error) {
    state.error = error;
  } finally {
    controller.abort();
  }
};
var nodeImports = {};

// node_modules/get-stream/source/contents.js
var getStreamContents = async (stream, { init, convertChunk, getSize, truncateChunk, addChunk, getFinalChunk, finalize }, { maxBuffer = Number.POSITIVE_INFINITY } = {}) => {
  const asyncIterable = getAsyncIterable(stream);
  const state = init();
  state.length = 0;
  try {
    for await (const chunk of asyncIterable) {
      const chunkType = getChunkType(chunk);
      const convertedChunk = convertChunk[chunkType](chunk, state);
      appendChunk({
        convertedChunk,
        state,
        getSize,
        truncateChunk,
        addChunk,
        maxBuffer
      });
    }
    appendFinalChunk({
      state,
      convertChunk,
      getSize,
      truncateChunk,
      addChunk,
      getFinalChunk,
      maxBuffer
    });
    return finalize(state);
  } catch (error) {
    const normalizedError = typeof error === "object" && error !== null ? error : new Error(error);
    normalizedError.bufferedData = finalize(state);
    throw normalizedError;
  }
};
var appendFinalChunk = ({ state, getSize, truncateChunk, addChunk, getFinalChunk, maxBuffer }) => {
  const convertedChunk = getFinalChunk(state);
  if (convertedChunk !== void 0) {
    appendChunk({
      convertedChunk,
      state,
      getSize,
      truncateChunk,
      addChunk,
      maxBuffer
    });
  }
};
var appendChunk = ({ convertedChunk, state, getSize, truncateChunk, addChunk, maxBuffer }) => {
  const chunkSize = getSize(convertedChunk);
  const newLength = state.length + chunkSize;
  if (newLength <= maxBuffer) {
    addNewChunk(convertedChunk, state, addChunk, newLength);
    return;
  }
  const truncatedChunk = truncateChunk(convertedChunk, maxBuffer - state.length);
  if (truncatedChunk !== void 0) {
    addNewChunk(truncatedChunk, state, addChunk, maxBuffer);
  }
  throw new MaxBufferError();
};
var addNewChunk = (convertedChunk, state, addChunk, newLength) => {
  state.contents = addChunk(convertedChunk, state, newLength);
  state.length = newLength;
};
var getChunkType = (chunk) => {
  const typeOfChunk = typeof chunk;
  if (typeOfChunk === "string") {
    return "string";
  }
  if (typeOfChunk !== "object" || chunk === null) {
    return "others";
  }
  if (globalThis.Buffer?.isBuffer(chunk)) {
    return "buffer";
  }
  const prototypeName = objectToString2.call(chunk);
  if (prototypeName === "[object ArrayBuffer]") {
    return "arrayBuffer";
  }
  if (prototypeName === "[object DataView]") {
    return "dataView";
  }
  if (Number.isInteger(chunk.byteLength) && Number.isInteger(chunk.byteOffset) && objectToString2.call(chunk.buffer) === "[object ArrayBuffer]") {
    return "typedArray";
  }
  return "others";
};
var { toString: objectToString2 } = Object.prototype;
var MaxBufferError = class extends Error {
  name = "MaxBufferError";
  constructor() {
    super("maxBuffer exceeded");
  }
};

// node_modules/get-stream/source/utils.js
var identity2 = (value) => value;
var noop = () => void 0;
var getContentsProperty = ({ contents }) => contents;
var throwObjectStream = (chunk) => {
  throw new Error(`Streams in object mode are not supported: ${String(chunk)}`);
};
var getLengthProperty = (convertedChunk) => convertedChunk.length;

// node_modules/get-stream/source/array.js
async function getStreamAsArray(stream, options) {
  return getStreamContents(stream, arrayMethods, options);
}
var initArray = () => ({ contents: [] });
var increment = () => 1;
var addArrayChunk = (convertedChunk, { contents }) => {
  contents.push(convertedChunk);
  return contents;
};
var arrayMethods = {
  init: initArray,
  convertChunk: {
    string: identity2,
    buffer: identity2,
    arrayBuffer: identity2,
    dataView: identity2,
    typedArray: identity2,
    others: identity2
  },
  getSize: increment,
  truncateChunk: noop,
  addChunk: addArrayChunk,
  getFinalChunk: noop,
  finalize: getContentsProperty
};

// node_modules/get-stream/source/array-buffer.js
async function getStreamAsArrayBuffer(stream, options) {
  return getStreamContents(stream, arrayBufferMethods, options);
}
var initArrayBuffer = () => ({ contents: new ArrayBuffer(0) });
var useTextEncoder = (chunk) => textEncoder2.encode(chunk);
var textEncoder2 = new TextEncoder();
var useUint8Array = (chunk) => new Uint8Array(chunk);
var useUint8ArrayWithOffset = (chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
var truncateArrayBufferChunk = (convertedChunk, chunkSize) => convertedChunk.slice(0, chunkSize);
var addArrayBufferChunk = (convertedChunk, { contents, length: previousLength }, length) => {
  const newContents = hasArrayBufferResize() ? resizeArrayBuffer(contents, length) : resizeArrayBufferSlow(contents, length);
  new Uint8Array(newContents).set(convertedChunk, previousLength);
  return newContents;
};
var resizeArrayBufferSlow = (contents, length) => {
  if (length <= contents.byteLength) {
    return contents;
  }
  const arrayBuffer = new ArrayBuffer(getNewContentsLength(length));
  new Uint8Array(arrayBuffer).set(new Uint8Array(contents), 0);
  return arrayBuffer;
};
var resizeArrayBuffer = (contents, length) => {
  if (length <= contents.maxByteLength) {
    contents.resize(length);
    return contents;
  }
  const arrayBuffer = new ArrayBuffer(length, { maxByteLength: getNewContentsLength(length) });
  new Uint8Array(arrayBuffer).set(new Uint8Array(contents), 0);
  return arrayBuffer;
};
var getNewContentsLength = (length) => SCALE_FACTOR ** Math.ceil(Math.log(length) / Math.log(SCALE_FACTOR));
var SCALE_FACTOR = 2;
var finalizeArrayBuffer = ({ contents, length }) => hasArrayBufferResize() ? contents : contents.slice(0, length);
var hasArrayBufferResize = () => "resize" in ArrayBuffer.prototype;
var arrayBufferMethods = {
  init: initArrayBuffer,
  convertChunk: {
    string: useTextEncoder,
    buffer: useUint8Array,
    arrayBuffer: useUint8Array,
    dataView: useUint8ArrayWithOffset,
    typedArray: useUint8ArrayWithOffset,
    others: throwObjectStream
  },
  getSize: getLengthProperty,
  truncateChunk: truncateArrayBufferChunk,
  addChunk: addArrayBufferChunk,
  getFinalChunk: noop,
  finalize: finalizeArrayBuffer
};

// node_modules/get-stream/source/string.js
async function getStreamAsString(stream, options) {
  return getStreamContents(stream, stringMethods, options);
}
var initString = () => ({ contents: "", textDecoder: new TextDecoder() });
var useTextDecoder = (chunk, { textDecoder: textDecoder2 }) => textDecoder2.decode(chunk, { stream: true });
var addStringChunk = (convertedChunk, { contents }) => contents + convertedChunk;
var truncateStringChunk = (convertedChunk, chunkSize) => convertedChunk.slice(0, chunkSize);
var getFinalStringChunk = ({ textDecoder: textDecoder2 }) => {
  const finalChunk = textDecoder2.decode();
  return finalChunk === "" ? void 0 : finalChunk;
};
var stringMethods = {
  init: initString,
  convertChunk: {
    string: identity2,
    buffer: useTextDecoder,
    arrayBuffer: useTextDecoder,
    dataView: useTextDecoder,
    typedArray: useTextDecoder,
    others: throwObjectStream
  },
  getSize: getLengthProperty,
  truncateChunk: truncateStringChunk,
  addChunk: addStringChunk,
  getFinalChunk: getFinalStringChunk,
  finalize: getContentsProperty
};

// node_modules/get-stream/source/index.js
Object.assign(nodeImports, { on, finished });

// node_modules/execa/lib/io/max-buffer.js
var handleMaxBuffer = ({ error, stream, readableObjectMode, lines, encoding, fdNumber }) => {
  if (!(error instanceof MaxBufferError)) {
    throw error;
  }
  if (fdNumber === "all") {
    return error;
  }
  const unit = getMaxBufferUnit(readableObjectMode, lines, encoding);
  error.maxBufferInfo = { fdNumber, unit };
  stream.destroy();
  throw error;
};
var getMaxBufferUnit = (readableObjectMode, lines, encoding) => {
  if (readableObjectMode) {
    return "objects";
  }
  if (lines) {
    return "lines";
  }
  if (encoding === "buffer") {
    return "bytes";
  }
  return "characters";
};
var checkIpcMaxBuffer = (subprocess, ipcOutput, maxBuffer) => {
  if (ipcOutput.length !== maxBuffer) {
    return;
  }
  const error = new MaxBufferError();
  error.maxBufferInfo = { fdNumber: "ipc" };
  throw error;
};
var getMaxBufferMessage = (error, maxBuffer) => {
  const { streamName, threshold, unit } = getMaxBufferInfo(error, maxBuffer);
  return `Command's ${streamName} was larger than ${threshold} ${unit}`;
};
var getMaxBufferInfo = (error, maxBuffer) => {
  if (error?.maxBufferInfo === void 0) {
    return { streamName: "output", threshold: maxBuffer[1], unit: "bytes" };
  }
  const { maxBufferInfo: { fdNumber, unit } } = error;
  delete error.maxBufferInfo;
  const threshold = getFdSpecificValue(maxBuffer, fdNumber);
  if (fdNumber === "ipc") {
    return { streamName: "IPC output", threshold, unit: "messages" };
  }
  return { streamName: getStreamName(fdNumber), threshold, unit };
};
var isMaxBufferSync = (resultError, output, maxBuffer) => resultError?.code === "ENOBUFS" && output !== null && output.some((result) => result !== null && result.length > getMaxBufferSync(maxBuffer));
var truncateMaxBufferSync = (result, isMaxBuffer, maxBuffer) => {
  if (!isMaxBuffer) {
    return result;
  }
  const maxBufferValue = getMaxBufferSync(maxBuffer);
  return result.length > maxBufferValue ? result.slice(0, maxBufferValue) : result;
};
var getMaxBufferSync = ([, stdoutMaxBuffer]) => stdoutMaxBuffer;

// node_modules/execa/lib/return/message.js
var createMessages = ({
  stdio,
  all,
  ipcOutput,
  originalError,
  signal,
  signalDescription,
  exitCode,
  escapedCommand,
  timedOut,
  isCanceled,
  isGracefullyCanceled,
  isMaxBuffer,
  isForcefullyTerminated,
  forceKillAfterDelay,
  killSignal,
  maxBuffer,
  timeout,
  cwd
}) => {
  const errorCode = originalError?.code;
  const prefix = getErrorPrefix({
    originalError,
    timedOut,
    timeout,
    isMaxBuffer,
    maxBuffer,
    errorCode,
    signal,
    signalDescription,
    exitCode,
    isCanceled,
    isGracefullyCanceled,
    isForcefullyTerminated,
    forceKillAfterDelay,
    killSignal
  });
  const originalMessage = getOriginalMessage(originalError, cwd);
  const suffix = originalMessage === void 0 ? "" : `
${originalMessage}`;
  const shortMessage = `${prefix}: ${escapedCommand}${suffix}`;
  const messageStdio = all === void 0 ? [stdio[2], stdio[1]] : [all];
  const message = [
    shortMessage,
    ...messageStdio,
    ...stdio.slice(3),
    ipcOutput.map((ipcMessage) => serializeIpcMessage(ipcMessage)).join("\n")
  ].map((messagePart) => escapeLines(stripFinalNewline(serializeMessagePart(messagePart)))).filter(Boolean).join("\n\n");
  return { originalMessage, shortMessage, message };
};
var getErrorPrefix = ({
  originalError,
  timedOut,
  timeout,
  isMaxBuffer,
  maxBuffer,
  errorCode,
  signal,
  signalDescription,
  exitCode,
  isCanceled,
  isGracefullyCanceled,
  isForcefullyTerminated,
  forceKillAfterDelay,
  killSignal
}) => {
  const forcefulSuffix = getForcefulSuffix(isForcefullyTerminated, forceKillAfterDelay);
  if (timedOut) {
    return `Command timed out after ${timeout} milliseconds${forcefulSuffix}`;
  }
  if (isGracefullyCanceled) {
    if (signal === void 0) {
      return `Command was gracefully canceled with exit code ${exitCode}`;
    }
    return isForcefullyTerminated ? `Command was gracefully canceled${forcefulSuffix}` : `Command was gracefully canceled with ${signal} (${signalDescription})`;
  }
  if (isCanceled) {
    return `Command was canceled${forcefulSuffix}`;
  }
  if (isMaxBuffer) {
    return `${getMaxBufferMessage(originalError, maxBuffer)}${forcefulSuffix}`;
  }
  if (errorCode !== void 0) {
    return `Command failed with ${errorCode}${forcefulSuffix}`;
  }
  if (isForcefullyTerminated) {
    return `Command was killed with ${killSignal} (${getSignalDescription(killSignal)})${forcefulSuffix}`;
  }
  if (signal !== void 0) {
    return `Command was killed with ${signal} (${signalDescription})`;
  }
  if (exitCode !== void 0) {
    return `Command failed with exit code ${exitCode}`;
  }
  return "Command failed";
};
var getForcefulSuffix = (isForcefullyTerminated, forceKillAfterDelay) => isForcefullyTerminated ? ` and was forcefully terminated after ${forceKillAfterDelay} milliseconds` : "";
var getOriginalMessage = (originalError, cwd) => {
  if (originalError instanceof DiscardedError) {
    return;
  }
  const originalMessage = isExecaError(originalError) ? originalError.originalMessage : String(originalError?.message ?? originalError);
  const escapedOriginalMessage = escapeLines(fixCwdError(originalMessage, cwd));
  return escapedOriginalMessage === "" ? void 0 : escapedOriginalMessage;
};
var serializeIpcMessage = (ipcMessage) => typeof ipcMessage === "string" ? ipcMessage : inspect2(ipcMessage);
var serializeMessagePart = (messagePart) => Array.isArray(messagePart) ? messagePart.map((messageItem) => stripFinalNewline(serializeMessageItem(messageItem))).filter(Boolean).join("\n") : serializeMessageItem(messagePart);
var serializeMessageItem = (messageItem) => {
  if (typeof messageItem === "string") {
    return messageItem;
  }
  if (isUint8Array(messageItem)) {
    return uint8ArrayToString(messageItem);
  }
  return "";
};

// node_modules/execa/lib/return/result.js
var makeSuccessResult = ({
  command,
  escapedCommand,
  stdio,
  all,
  ipcOutput,
  options: { cwd },
  startTime
}) => omitUndefinedProperties({
  command,
  escapedCommand,
  cwd,
  durationMs: getDurationMs(startTime),
  failed: false,
  timedOut: false,
  isCanceled: false,
  isGracefullyCanceled: false,
  isTerminated: false,
  isMaxBuffer: false,
  isForcefullyTerminated: false,
  exitCode: 0,
  stdout: stdio[1],
  stderr: stdio[2],
  all,
  stdio,
  ipcOutput,
  pipedFrom: []
});
var makeEarlyError = ({
  error,
  command,
  escapedCommand,
  fileDescriptors,
  options,
  startTime,
  isSync
}) => makeError({
  error,
  command,
  escapedCommand,
  startTime,
  timedOut: false,
  isCanceled: false,
  isGracefullyCanceled: false,
  isMaxBuffer: false,
  isForcefullyTerminated: false,
  stdio: Array.from({ length: fileDescriptors.length }),
  ipcOutput: [],
  options,
  isSync
});
var makeError = ({
  error: originalError,
  command,
  escapedCommand,
  startTime,
  timedOut,
  isCanceled,
  isGracefullyCanceled,
  isMaxBuffer,
  isForcefullyTerminated,
  exitCode: rawExitCode,
  signal: rawSignal,
  stdio,
  all,
  ipcOutput,
  options: {
    timeoutDuration,
    timeout = timeoutDuration,
    forceKillAfterDelay,
    killSignal,
    cwd,
    maxBuffer
  },
  isSync
}) => {
  const { exitCode, signal, signalDescription } = normalizeExitPayload(rawExitCode, rawSignal);
  const { originalMessage, shortMessage, message } = createMessages({
    stdio,
    all,
    ipcOutput,
    originalError,
    signal,
    signalDescription,
    exitCode,
    escapedCommand,
    timedOut,
    isCanceled,
    isGracefullyCanceled,
    isMaxBuffer,
    isForcefullyTerminated,
    forceKillAfterDelay,
    killSignal,
    maxBuffer,
    timeout,
    cwd
  });
  const error = getFinalError(originalError, message, isSync);
  Object.assign(error, getErrorProperties({
    error,
    command,
    escapedCommand,
    startTime,
    timedOut,
    isCanceled,
    isGracefullyCanceled,
    isMaxBuffer,
    isForcefullyTerminated,
    exitCode,
    signal,
    signalDescription,
    stdio,
    all,
    ipcOutput,
    cwd,
    originalMessage,
    shortMessage
  }));
  return error;
};
var getErrorProperties = ({
  error,
  command,
  escapedCommand,
  startTime,
  timedOut,
  isCanceled,
  isGracefullyCanceled,
  isMaxBuffer,
  isForcefullyTerminated,
  exitCode,
  signal,
  signalDescription,
  stdio,
  all,
  ipcOutput,
  cwd,
  originalMessage,
  shortMessage
}) => omitUndefinedProperties({
  shortMessage,
  originalMessage,
  command,
  escapedCommand,
  cwd,
  durationMs: getDurationMs(startTime),
  failed: true,
  timedOut,
  isCanceled,
  isGracefullyCanceled,
  isTerminated: signal !== void 0,
  isMaxBuffer,
  isForcefullyTerminated,
  exitCode,
  signal,
  signalDescription,
  code: error.cause?.code,
  stdout: stdio[1],
  stderr: stdio[2],
  all,
  stdio,
  ipcOutput,
  pipedFrom: []
});
var omitUndefinedProperties = (result) => Object.fromEntries(Object.entries(result).filter(([, value]) => value !== void 0));
var normalizeExitPayload = (rawExitCode, rawSignal) => {
  const exitCode = rawExitCode === null ? void 0 : rawExitCode;
  const signal = rawSignal === null ? void 0 : rawSignal;
  const signalDescription = signal === void 0 ? void 0 : getSignalDescription(rawSignal);
  return { exitCode, signal, signalDescription };
};

// node_modules/parse-ms/index.js
var toZeroIfInfinity = (value) => Number.isFinite(value) ? value : 0;
function parseNumber(milliseconds) {
  return {
    days: Math.trunc(milliseconds / 864e5),
    hours: Math.trunc(milliseconds / 36e5 % 24),
    minutes: Math.trunc(milliseconds / 6e4 % 60),
    seconds: Math.trunc(milliseconds / 1e3 % 60),
    milliseconds: Math.trunc(milliseconds % 1e3),
    microseconds: Math.trunc(toZeroIfInfinity(milliseconds * 1e3) % 1e3),
    nanoseconds: Math.trunc(toZeroIfInfinity(milliseconds * 1e6) % 1e3)
  };
}
function parseBigint(milliseconds) {
  return {
    days: milliseconds / 86400000n,
    hours: milliseconds / 3600000n % 24n,
    minutes: milliseconds / 60000n % 60n,
    seconds: milliseconds / 1000n % 60n,
    milliseconds: milliseconds % 1000n,
    microseconds: 0n,
    nanoseconds: 0n
  };
}
function parseMilliseconds(milliseconds) {
  switch (typeof milliseconds) {
    case "number": {
      if (Number.isFinite(milliseconds)) {
        return parseNumber(milliseconds);
      }
      break;
    }
    case "bigint": {
      return parseBigint(milliseconds);
    }
  }
  throw new TypeError("Expected a finite number or bigint");
}

// node_modules/pretty-ms/index.js
var isZero = (value) => value === 0 || value === 0n;
var pluralize = (word, count2) => count2 === 1 || count2 === 1n ? word : `${word}s`;
var SECOND_ROUNDING_EPSILON = 1e-7;
var ONE_DAY_IN_MILLISECONDS = 24n * 60n * 60n * 1000n;
function prettyMilliseconds(milliseconds, options) {
  const isBigInt = typeof milliseconds === "bigint";
  if (!isBigInt && !Number.isFinite(milliseconds)) {
    throw new TypeError("Expected a finite number or bigint");
  }
  options = { ...options };
  const sign = milliseconds < 0 ? "-" : "";
  milliseconds = milliseconds < 0 ? -milliseconds : milliseconds;
  if (options.colonNotation) {
    options.compact = false;
    options.formatSubMilliseconds = false;
    options.separateMilliseconds = false;
    options.verbose = false;
  }
  if (options.compact) {
    options.unitCount = 1;
    options.secondsDecimalDigits = 0;
    options.millisecondsDecimalDigits = 0;
  }
  let result = [];
  const floorDecimals = (value, decimalDigits) => {
    const flooredInterimValue = Math.floor(value * 10 ** decimalDigits + SECOND_ROUNDING_EPSILON);
    const flooredValue = Math.round(flooredInterimValue) / 10 ** decimalDigits;
    return flooredValue.toFixed(decimalDigits);
  };
  const add = (value, long, short2, valueString) => {
    if ((result.length === 0 || !options.colonNotation) && isZero(value) && !(options.colonNotation && short2 === "m")) {
      return;
    }
    valueString ??= String(value);
    if (options.colonNotation) {
      const wholeDigits = valueString.includes(".") ? valueString.split(".")[0].length : valueString.length;
      const minLength = result.length > 0 ? 2 : 1;
      valueString = "0".repeat(Math.max(0, minLength - wholeDigits)) + valueString;
    } else {
      valueString += options.verbose ? " " + pluralize(long, value) : short2;
    }
    result.push(valueString);
  };
  const parsed = parseMilliseconds(milliseconds);
  const days = BigInt(parsed.days);
  if (options.hideYearAndDays) {
    add(BigInt(days) * 24n + BigInt(parsed.hours), "hour", "h");
  } else {
    if (options.hideYear) {
      add(days, "day", "d");
    } else {
      add(days / 365n, "year", "y");
      add(days % 365n, "day", "d");
    }
    add(Number(parsed.hours), "hour", "h");
  }
  add(Number(parsed.minutes), "minute", "m");
  if (!options.hideSeconds) {
    if (options.separateMilliseconds || options.formatSubMilliseconds || !options.colonNotation && milliseconds < 1e3 && !options.subSecondsAsDecimals) {
      const seconds = Number(parsed.seconds);
      const milliseconds2 = Number(parsed.milliseconds);
      const microseconds = Number(parsed.microseconds);
      const nanoseconds = Number(parsed.nanoseconds);
      add(seconds, "second", "s");
      if (options.formatSubMilliseconds) {
        add(milliseconds2, "millisecond", "ms");
        add(microseconds, "microsecond", "\xB5s");
        add(nanoseconds, "nanosecond", "ns");
      } else {
        const millisecondsAndBelow = milliseconds2 + microseconds / 1e3 + nanoseconds / 1e6;
        const millisecondsDecimalDigits = typeof options.millisecondsDecimalDigits === "number" ? options.millisecondsDecimalDigits : 0;
        const roundedMilliseconds = millisecondsAndBelow >= 1 ? Math.round(millisecondsAndBelow) : Math.ceil(millisecondsAndBelow);
        const maximumMilliseconds = 1e3 - 10 ** -millisecondsDecimalDigits;
        const millisecondsString = millisecondsDecimalDigits ? Math.min(millisecondsAndBelow, maximumMilliseconds).toFixed(millisecondsDecimalDigits) : Math.min(roundedMilliseconds, maximumMilliseconds);
        add(
          Number.parseFloat(millisecondsString),
          "millisecond",
          "ms",
          millisecondsString
        );
      }
    } else {
      const seconds = (isBigInt ? Number(milliseconds % ONE_DAY_IN_MILLISECONDS) : milliseconds) / 1e3 % 60;
      const secondsDecimalDigits = typeof options.secondsDecimalDigits === "number" ? options.secondsDecimalDigits : 1;
      const secondsFixed = floorDecimals(seconds, secondsDecimalDigits);
      const secondsString = options.keepDecimalsOnWholeSeconds ? secondsFixed : secondsFixed.replace(/\.0+$/, "");
      add(Number.parseFloat(secondsString), "second", "s", secondsString);
    }
  }
  if (result.length === 0) {
    return sign + "0" + (options.verbose ? " milliseconds" : "ms");
  }
  const separator = options.colonNotation ? ":" : " ";
  if (typeof options.unitCount === "number") {
    result = result.slice(0, Math.max(options.unitCount, 1));
  }
  return sign + result.join(separator);
}

// node_modules/execa/lib/verbose/error.js
var logError = (result, verboseInfo) => {
  if (result.failed) {
    verboseLog({
      type: "error",
      verboseMessage: result.shortMessage,
      verboseInfo,
      result
    });
  }
};

// node_modules/execa/lib/verbose/complete.js
var logResult = (result, verboseInfo) => {
  if (!isVerbose(verboseInfo)) {
    return;
  }
  logError(result, verboseInfo);
  logDuration(result, verboseInfo);
};
var logDuration = (result, verboseInfo) => {
  const verboseMessage = `(done in ${prettyMilliseconds(result.durationMs)})`;
  verboseLog({
    type: "duration",
    verboseMessage,
    verboseInfo,
    result
  });
};

// node_modules/execa/lib/return/reject.js
var handleResult = (result, verboseInfo, { reject }) => {
  logResult(result, verboseInfo);
  if (result.failed && reject) {
    throw result;
  }
  return result;
};

// node_modules/execa/lib/stdio/handle-sync.js
import { readFileSync as readFileSync2 } from "node:fs";

// node_modules/execa/lib/stdio/type.js
var getStdioItemType = (value, optionName) => {
  if (isAsyncGenerator(value)) {
    return "asyncGenerator";
  }
  if (isSyncGenerator(value)) {
    return "generator";
  }
  if (isUrl(value)) {
    return "fileUrl";
  }
  if (isFilePathObject(value)) {
    return "filePath";
  }
  if (isWebStream(value)) {
    return "webStream";
  }
  if (isStream(value, { checkOpen: false })) {
    return "native";
  }
  if (isUint8Array(value)) {
    return "uint8Array";
  }
  if (isAsyncIterableObject(value)) {
    return "asyncIterable";
  }
  if (isIterableObject(value)) {
    return "iterable";
  }
  if (isTransformStream(value)) {
    return getTransformStreamType({ transform: value }, optionName);
  }
  if (isTransformOptions(value)) {
    return getTransformObjectType(value, optionName);
  }
  return "native";
};
var getTransformObjectType = (value, optionName) => {
  if (isDuplexStream(value.transform, { checkOpen: false })) {
    return getDuplexType(value, optionName);
  }
  if (isTransformStream(value.transform)) {
    return getTransformStreamType(value, optionName);
  }
  return getGeneratorObjectType(value, optionName);
};
var getDuplexType = (value, optionName) => {
  validateNonGeneratorType(value, optionName, "Duplex stream");
  return "duplex";
};
var getTransformStreamType = (value, optionName) => {
  validateNonGeneratorType(value, optionName, "web TransformStream");
  return "webTransform";
};
var validateNonGeneratorType = ({ final, binary, objectMode }, optionName, typeName) => {
  checkUndefinedOption(final, `${optionName}.final`, typeName);
  checkUndefinedOption(binary, `${optionName}.binary`, typeName);
  checkBooleanOption(objectMode, `${optionName}.objectMode`);
};
var checkUndefinedOption = (value, optionName, typeName) => {
  if (value !== void 0) {
    throw new TypeError(`The \`${optionName}\` option can only be defined when using a generator, not a ${typeName}.`);
  }
};
var getGeneratorObjectType = ({ transform, final, binary, objectMode }, optionName) => {
  if (transform !== void 0 && !isGenerator(transform)) {
    throw new TypeError(`The \`${optionName}.transform\` option must be a generator, a Duplex stream or a web TransformStream.`);
  }
  if (isDuplexStream(final, { checkOpen: false })) {
    throw new TypeError(`The \`${optionName}.final\` option must not be a Duplex stream.`);
  }
  if (isTransformStream(final)) {
    throw new TypeError(`The \`${optionName}.final\` option must not be a web TransformStream.`);
  }
  if (final !== void 0 && !isGenerator(final)) {
    throw new TypeError(`The \`${optionName}.final\` option must be a generator.`);
  }
  checkBooleanOption(binary, `${optionName}.binary`);
  checkBooleanOption(objectMode, `${optionName}.objectMode`);
  return isAsyncGenerator(transform) || isAsyncGenerator(final) ? "asyncGenerator" : "generator";
};
var checkBooleanOption = (value, optionName) => {
  if (value !== void 0 && typeof value !== "boolean") {
    throw new TypeError(`The \`${optionName}\` option must use a boolean.`);
  }
};
var isGenerator = (value) => isAsyncGenerator(value) || isSyncGenerator(value);
var isAsyncGenerator = (value) => Object.prototype.toString.call(value) === "[object AsyncGeneratorFunction]";
var isSyncGenerator = (value) => Object.prototype.toString.call(value) === "[object GeneratorFunction]";
var isTransformOptions = (value) => isPlainObject(value) && (value.transform !== void 0 || value.final !== void 0);
var isUrl = (value) => Object.prototype.toString.call(value) === "[object URL]";
var isRegularUrl = (value) => isUrl(value) && value.protocol !== "file:";
var isFilePathObject = (value) => isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => FILE_PATH_KEYS.has(key)) && isFilePathString(value.file);
var FILE_PATH_KEYS = /* @__PURE__ */ new Set(["file", "append"]);
var isFilePathString = (file) => typeof file === "string";
var isStdioValueObject = (value) => isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => STDIO_VALUE_KEYS.has(key)) && "value" in value;
var STDIO_VALUE_KEYS = /* @__PURE__ */ new Set(["value", "input"]);
var isUnknownStdioString = (type, value) => type === "native" && typeof value === "string" && !KNOWN_STDIO_STRINGS.has(value);
var KNOWN_STDIO_STRINGS = /* @__PURE__ */ new Set(["ipc", "ignore", "inherit", "overlapped", "pipe"]);
var isReadableStream2 = (value) => Object.prototype.toString.call(value) === "[object ReadableStream]";
var isWritableStream2 = (value) => Object.prototype.toString.call(value) === "[object WritableStream]";
var isWebStream = (value) => isReadableStream2(value) || isWritableStream2(value);
var isTransformStream = (value) => isReadableStream2(value?.readable) && isWritableStream2(value?.writable);
var isAsyncIterableObject = (value) => isObject(value) && typeof value[Symbol.asyncIterator] === "function";
var isIterableObject = (value) => isObject(value) && typeof value[Symbol.iterator] === "function";
var isObject = (value) => typeof value === "object" && value !== null;
var TRANSFORM_TYPES = /* @__PURE__ */ new Set(["generator", "asyncGenerator", "duplex", "webTransform"]);
var FILE_TYPES = /* @__PURE__ */ new Set(["fileUrl", "filePath", "fileNumber"]);
var SPECIAL_DUPLICATE_TYPES_SYNC = /* @__PURE__ */ new Set(["fileUrl", "filePath"]);
var SPECIAL_DUPLICATE_TYPES = /* @__PURE__ */ new Set([...SPECIAL_DUPLICATE_TYPES_SYNC, "webStream", "nodeStream"]);
var FORBID_DUPLICATE_TYPES = /* @__PURE__ */ new Set(["webTransform", "duplex"]);
var TYPE_TO_MESSAGE = {
  generator: "a generator",
  asyncGenerator: "an async generator",
  fileUrl: "a file URL",
  filePath: "a file path string",
  fileNumber: "a file descriptor number",
  webStream: "a web stream",
  nodeStream: "a Node.js stream",
  webTransform: "a web TransformStream",
  duplex: "a Duplex stream",
  native: "any value",
  iterable: "an iterable",
  asyncIterable: "an async iterable",
  string: "a string",
  uint8Array: "a Uint8Array"
};

// node_modules/execa/lib/transform/object-mode.js
var getTransformObjectModes = (objectMode, index, newTransforms, direction) => direction === "output" ? getOutputObjectModes(objectMode, index, newTransforms) : getInputObjectModes(objectMode, index, newTransforms);
var getOutputObjectModes = (objectMode, index, newTransforms) => {
  const writableObjectMode = index !== 0 && newTransforms[index - 1].value.readableObjectMode;
  const readableObjectMode = objectMode ?? writableObjectMode;
  return { writableObjectMode, readableObjectMode };
};
var getInputObjectModes = (objectMode, index, newTransforms) => {
  const writableObjectMode = index === 0 ? objectMode === true : newTransforms[index - 1].value.readableObjectMode;
  const readableObjectMode = index !== newTransforms.length - 1 && (objectMode ?? writableObjectMode);
  return { writableObjectMode, readableObjectMode };
};
var getFdObjectMode = (stdioItems, direction) => {
  const lastTransform = stdioItems.findLast(({ type }) => TRANSFORM_TYPES.has(type));
  if (lastTransform === void 0) {
    return false;
  }
  return direction === "input" ? lastTransform.value.writableObjectMode : lastTransform.value.readableObjectMode;
};

// node_modules/execa/lib/transform/normalize.js
var normalizeTransforms = (stdioItems, optionName, direction, options) => [
  ...stdioItems.filter(({ type }) => !TRANSFORM_TYPES.has(type)),
  ...getTransforms(stdioItems, optionName, direction, options)
];
var getTransforms = (stdioItems, optionName, direction, { encoding }) => {
  const transforms = stdioItems.filter(({ type }) => TRANSFORM_TYPES.has(type));
  const newTransforms = Array.from({ length: transforms.length });
  for (const [index, stdioItem] of Object.entries(transforms)) {
    newTransforms[index] = normalizeTransform({
      stdioItem,
      index: Number(index),
      newTransforms,
      optionName,
      direction,
      encoding
    });
  }
  return sortTransforms(newTransforms, direction);
};
var normalizeTransform = ({ stdioItem, stdioItem: { type }, index, newTransforms, optionName, direction, encoding }) => {
  if (type === "duplex") {
    return normalizeDuplex({ stdioItem, optionName });
  }
  if (type === "webTransform") {
    return normalizeTransformStream({
      stdioItem,
      index,
      newTransforms,
      direction
    });
  }
  return normalizeGenerator({
    stdioItem,
    index,
    newTransforms,
    direction,
    encoding
  });
};
var normalizeDuplex = ({ stdioItem, optionName }) => {
  const { value } = stdioItem;
  const { transform } = value;
  const { writableObjectMode, readableObjectMode } = transform;
  const { objectMode = readableObjectMode } = value;
  if (objectMode && !readableObjectMode) {
    throw new TypeError(`The \`${optionName}.objectMode\` option can only be \`true\` if \`new Duplex({objectMode: true})\` is used.`);
  }
  if (!objectMode && readableObjectMode) {
    throw new TypeError(`The \`${optionName}.objectMode\` option cannot be \`false\` if \`new Duplex({objectMode: true})\` is used.`);
  }
  return {
    ...stdioItem,
    value: { transform, writableObjectMode, readableObjectMode }
  };
};
var normalizeTransformStream = ({ stdioItem, stdioItem: { value }, index, newTransforms, direction }) => {
  const { transform, objectMode } = isPlainObject(value) ? value : { transform: value };
  const { writableObjectMode, readableObjectMode } = getTransformObjectModes(objectMode, index, newTransforms, direction);
  return {
    ...stdioItem,
    value: { transform, writableObjectMode, readableObjectMode }
  };
};
var normalizeGenerator = ({ stdioItem, stdioItem: { value }, index, newTransforms, direction, encoding }) => {
  const {
    transform,
    final,
    binary: binaryOption = false,
    preserveNewlines = false,
    objectMode
  } = isPlainObject(value) ? value : { transform: value };
  const binary = binaryOption || BINARY_ENCODINGS.has(encoding);
  const { writableObjectMode, readableObjectMode } = getTransformObjectModes(objectMode, index, newTransforms, direction);
  return {
    ...stdioItem,
    value: {
      transform,
      final,
      binary,
      preserveNewlines,
      writableObjectMode,
      readableObjectMode
    }
  };
};
var sortTransforms = (newTransforms, direction) => direction === "input" ? newTransforms.reverse() : newTransforms;

// node_modules/execa/lib/stdio/direction.js
import process9 from "node:process";
var getStreamDirection = (stdioItems, fdNumber, optionName) => {
  const directions = stdioItems.map((stdioItem) => getStdioItemDirection(stdioItem, fdNumber));
  if (directions.includes("input") && directions.includes("output")) {
    throw new TypeError(`The \`${optionName}\` option must not be an array of both readable and writable values.`);
  }
  return directions.find(Boolean) ?? DEFAULT_DIRECTION;
};
var getStdioItemDirection = (stdioItem, fdNumber) => KNOWN_DIRECTIONS[fdNumber] ?? getRequestedDirection(stdioItem);
var getRequestedDirection = ({ type, value, direction, optionName }) => {
  const guessedDirection = guessStreamDirection[type](value);
  if (direction === "input" && guessedDirection === "output") {
    throw new TypeError(`The \`${optionName}\` option is invalid: \`input: true\` cannot be used with a writable value, which is always an output.`);
  }
  return direction ?? guessedDirection;
};
var KNOWN_DIRECTIONS = ["input", "output", "output"];
var anyDirection = () => void 0;
var alwaysInput = () => "input";
var guessStreamDirection = {
  generator: anyDirection,
  asyncGenerator: anyDirection,
  fileUrl: anyDirection,
  filePath: anyDirection,
  iterable: alwaysInput,
  asyncIterable: alwaysInput,
  uint8Array: alwaysInput,
  webStream: (value) => isWritableStream2(value) ? "output" : "input",
  nodeStream(value) {
    if (!isReadableStream(value, { checkOpen: false })) {
      return "output";
    }
    return isWritableStream(value, { checkOpen: false }) ? void 0 : "input";
  },
  webTransform: anyDirection,
  duplex: anyDirection,
  native(value) {
    const standardStreamDirection = getStandardStreamDirection(value);
    if (standardStreamDirection !== void 0) {
      return standardStreamDirection;
    }
    if (isStream(value, { checkOpen: false })) {
      return guessStreamDirection.nodeStream(value);
    }
  }
};
var getStandardStreamDirection = (value) => {
  if ([0, process9.stdin].includes(value)) {
    return "input";
  }
  if ([1, 2, process9.stdout, process9.stderr].includes(value)) {
    return "output";
  }
};
var DEFAULT_DIRECTION = "output";

// node_modules/execa/lib/ipc/array.js
var normalizeIpcStdioArray = (stdioArray, ipc) => ipc ? [...stdioArray, "ipc"] : stdioArray;

// node_modules/execa/lib/stdio/stdio-option.js
var normalizeStdioOption = ({ stdio, ipc, buffer, ...options }, verboseInfo, isSync) => {
  const stdioArray = getStdioArray(stdio, options).map((stdioOption, fdNumber) => addDefaultValue2(stdioOption, fdNumber));
  validateIpcStdioOption(stdioArray);
  return isSync ? normalizeStdioSync(stdioArray, buffer, verboseInfo) : normalizeIpcStdioArray(stdioArray, ipc);
};
var validateIpcStdioOption = (stdioArray) => {
  if (stdioArray.some((stdioOption) => hasIpcStdioOption(stdioOption))) {
    throw new Error("The `ipc: true` option must be used instead of `stdio: 'ipc'`.");
  }
};
var hasIpcStdioOption = (stdioOption) => {
  if (Array.isArray(stdioOption)) {
    return stdioOption.some((item) => hasIpcStdioItem(item));
  }
  return hasIpcStdioItem(stdioOption);
};
var hasIpcStdioItem = (stdioOption) => {
  if (isStdioValueObject(stdioOption)) {
    return stdioOption.value === "ipc";
  }
  return stdioOption === "ipc";
};
var getStdioArray = (stdio, options) => {
  if (stdio === void 0) {
    return STANDARD_STREAMS_ALIASES.map((alias) => options[alias]);
  }
  if (hasAlias(options)) {
    throw new Error(`It's not possible to provide \`stdio\` in combination with one of ${STANDARD_STREAMS_ALIASES.map((alias) => `\`${alias}\``).join(", ")}`);
  }
  if (typeof stdio === "string") {
    return [stdio, stdio, stdio];
  }
  if (!Array.isArray(stdio)) {
    throw new TypeError(`Expected \`stdio\` to be of type \`string\` or \`Array\`, got \`${typeof stdio}\``);
  }
  const length = Math.max(stdio.length, STANDARD_STREAMS_ALIASES.length);
  return Array.from({ length }, (_, fdNumber) => stdio[fdNumber]);
};
var hasAlias = (options) => STANDARD_STREAMS_ALIASES.some((alias) => options[alias] !== void 0);
var addDefaultValue2 = (stdioOption, fdNumber) => {
  if (Array.isArray(stdioOption)) {
    return stdioOption.map((item) => addDefaultValue2(item, fdNumber));
  }
  if (stdioOption === null || stdioOption === void 0) {
    return fdNumber >= STANDARD_STREAMS_ALIASES.length ? "ignore" : "pipe";
  }
  return stdioOption;
};
var normalizeStdioSync = (stdioArray, buffer, verboseInfo) => stdioArray.map((stdioOption, fdNumber) => !buffer[fdNumber] && fdNumber !== 0 && !isFullVerbose(verboseInfo, fdNumber) && isOutputPipeOnly(stdioOption, fdNumber) ? "ignore" : stdioOption);
var isOutputPipeOnly = (stdioOption, fdNumber) => isOutputPipe(stdioOption, fdNumber) || Array.isArray(stdioOption) && stdioOption.every((item) => isOutputPipe(item, fdNumber));
var isOutputPipe = (stdioOption, fdNumber) => stdioOption === "pipe" || isOutputPipeObject(stdioOption, fdNumber);
var isOutputPipeObject = (stdioOption, fdNumber) => isStdioValueObject(stdioOption) && stdioOption.value === "pipe" && (stdioOption.input === void 0 || stdioOption.input === false || isFixedOutputPipe(fdNumber, stdioOption.input));
var isFixedOutputPipe = (fdNumber, input) => input === true && (fdNumber === 1 || fdNumber === 2);

// node_modules/execa/lib/stdio/native.js
import { readFileSync } from "node:fs";
import tty2 from "node:tty";

// node_modules/execa/lib/arguments/fd-options.js
var getToStream = (destination, to = "stdin") => {
  const isWritable = true;
  const { options, fileDescriptors } = SUBPROCESS_OPTIONS.get(destination);
  const fdNumber = getFdNumber(fileDescriptors, to, isWritable);
  const destinationStream = destination.stdio[fdNumber];
  if (destinationStream === null) {
    throw new TypeError(getInvalidStdioOptionMessage(fdNumber, to, options, isWritable));
  }
  return destinationStream;
};
var getFromStream = (source, from = "stdout") => {
  const isWritable = false;
  const { options, fileDescriptors } = SUBPROCESS_OPTIONS.get(source);
  const fdNumber = getFdNumber(fileDescriptors, from, isWritable);
  const sourceStream = fdNumber === "all" ? source.all : source.stdio[fdNumber];
  if (sourceStream === null || sourceStream === void 0) {
    throw new TypeError(getInvalidStdioOptionMessage(fdNumber, from, options, isWritable));
  }
  return sourceStream;
};
var SUBPROCESS_OPTIONS = /* @__PURE__ */ new WeakMap();
var getFdNumber = (fileDescriptors, fdName, isWritable) => {
  const fdNumber = parseFdNumber(fdName, isWritable);
  validateFdNumber(fdNumber, fdName, isWritable, fileDescriptors);
  return fdNumber;
};
var parseFdNumber = (fdName, isWritable) => {
  const fdNumber = parseFd(fdName);
  if (fdNumber !== void 0) {
    return fdNumber;
  }
  const { validOptions, defaultValue } = isWritable ? { validOptions: '"stdin"', defaultValue: "stdin" } : { validOptions: '"stdout", "stderr", "all"', defaultValue: "stdout" };
  throw new TypeError(`"${getOptionName(isWritable)}" must not be "${fdName}".
It must be ${validOptions} or "fd3", "fd4" (and so on).
It is optional and defaults to "${defaultValue}".`);
};
var validateFdNumber = (fdNumber, fdName, isWritable, fileDescriptors) => {
  const fileDescriptor = fileDescriptors[getUsedDescriptor(fdNumber)];
  if (fileDescriptor === void 0) {
    throw new TypeError(`"${getOptionName(isWritable)}" must not be ${fdName}. That file descriptor does not exist.
Please set the "stdio" option to ensure that file descriptor exists.`);
  }
  if (fileDescriptor.direction === "input" && !isWritable) {
    throw new TypeError(`"${getOptionName(isWritable)}" must not be ${fdName}. It must be a readable stream, not writable.`);
  }
  if (fileDescriptor.direction !== "input" && isWritable) {
    throw new TypeError(`"${getOptionName(isWritable)}" must not be ${fdName}. It must be a writable stream, not readable.
If you meant to use it as input, please set its "stdio" option to \`{value: 'pipe', input: true}\`.`);
  }
};
var getInvalidStdioOptionMessage = (fdNumber, fdName, options, isWritable) => {
  if (fdNumber === "all" && !options.all) {
    return `The "all" option must be true to use "from: 'all'".`;
  }
  const { optionName, optionValue } = getInvalidStdioOption(fdNumber, options);
  return `The "${optionName}: ${serializeOptionValue(optionValue)}" option is incompatible with using "${getOptionName(isWritable)}: ${serializeOptionValue(fdName)}".
Please set this option with "pipe" instead.`;
};
var getInvalidStdioOption = (fdNumber, { stdin, stdout, stderr, stdio }) => {
  const usedDescriptor = getUsedDescriptor(fdNumber);
  if (usedDescriptor === 0 && stdin !== void 0) {
    return { optionName: "stdin", optionValue: stdin };
  }
  if (usedDescriptor === 1 && stdout !== void 0) {
    return { optionName: "stdout", optionValue: stdout };
  }
  if (usedDescriptor === 2 && stderr !== void 0) {
    return { optionName: "stderr", optionValue: stderr };
  }
  return { optionName: `stdio[${usedDescriptor}]`, optionValue: stdio[usedDescriptor] };
};
var getUsedDescriptor = (fdNumber) => fdNumber === "all" ? 1 : fdNumber;
var getOptionName = (isWritable) => isWritable ? "to" : "from";
var serializeOptionValue = (value) => {
  if (typeof value === "string") {
    return `'${value}'`;
  }
  return typeof value === "number" ? `${value}` : "Stream";
};

// node_modules/execa/lib/stdio/native.js
var handleNativeStream = ({ stdioItem, stdioItem: { type }, isStdioArray, fdNumber, direction, isSync }) => {
  if (!isStdioArray || type !== "native") {
    return stdioItem;
  }
  return isSync ? handleNativeStreamSync({ stdioItem, fdNumber, direction }) : handleNativeStreamAsync({ stdioItem, fdNumber });
};
var handleNativeStreamSync = ({ stdioItem, stdioItem: { value, optionName }, fdNumber, direction }) => {
  const targetFd = getTargetFd({
    value,
    optionName,
    fdNumber,
    direction
  });
  if (targetFd !== void 0) {
    return targetFd;
  }
  if (isStream(value, { checkOpen: false })) {
    throw new TypeError(`The \`${optionName}: Stream\` option cannot both be an array and include a stream with synchronous methods.`);
  }
  return stdioItem;
};
var getTargetFd = ({ value, optionName, fdNumber, direction }) => {
  const targetFdNumber = getTargetFdNumber(value, fdNumber);
  if (targetFdNumber === void 0) {
    return;
  }
  if (direction === "output") {
    return { type: "fileNumber", value: targetFdNumber, optionName };
  }
  if (tty2.isatty(targetFdNumber)) {
    throw new TypeError(`The \`${optionName}: ${serializeOptionValue(value)}\` option is invalid: it cannot be a TTY with synchronous methods.`);
  }
  return { type: "uint8Array", value: bufferToUint8Array(readFileSync(targetFdNumber)), optionName };
};
var getTargetFdNumber = (value, fdNumber) => {
  if (value === "inherit") {
    return fdNumber;
  }
  if (typeof value === "number") {
    return value;
  }
  const standardStreamIndex = STANDARD_STREAMS.indexOf(value);
  if (standardStreamIndex !== -1) {
    return standardStreamIndex;
  }
};
var handleNativeStreamAsync = ({ stdioItem, stdioItem: { value, optionName }, fdNumber }) => {
  if (value === "inherit") {
    return { type: "nodeStream", value: getStandardStream(fdNumber, value, optionName), optionName };
  }
  if (typeof value === "number") {
    return { type: "nodeStream", value: getStandardStream(value, value, optionName), optionName };
  }
  if (isStream(value, { checkOpen: false })) {
    return { type: "nodeStream", value, optionName };
  }
  return stdioItem;
};
var getStandardStream = (fdNumber, value, optionName) => {
  const standardStream = STANDARD_STREAMS[fdNumber];
  if (standardStream === void 0) {
    throw new TypeError(`The \`${optionName}: ${value}\` option is invalid: no such standard stream.`);
  }
  return standardStream;
};

// node_modules/execa/lib/stdio/input-option.js
var handleInputOptions = ({ input, inputFile }, fdNumber) => fdNumber === 0 ? [
  ...handleInputOption(input),
  ...handleInputFileOption(inputFile)
] : [];
var handleInputOption = (input) => input === void 0 ? [] : [{
  type: getInputType(input),
  value: input,
  optionName: "input"
}];
var getInputType = (input) => {
  if (isReadableStream(input, { checkOpen: false })) {
    return "nodeStream";
  }
  if (typeof input === "string") {
    return "string";
  }
  if (isUint8Array(input)) {
    return "uint8Array";
  }
  throw new Error("The `input` option must be a string, a Uint8Array or a Node.js Readable stream.");
};
var handleInputFileOption = (inputFile) => inputFile === void 0 ? [] : [{
  ...getInputFileType(inputFile),
  optionName: "inputFile"
}];
var getInputFileType = (inputFile) => {
  if (isUrl(inputFile)) {
    return { type: "fileUrl", value: inputFile };
  }
  if (isFilePathString(inputFile)) {
    return { type: "filePath", value: { file: inputFile } };
  }
  throw new Error("The `inputFile` option must be a file path string or a file URL.");
};

// node_modules/execa/lib/stdio/duplicate.js
var filterDuplicates = (stdioItems) => stdioItems.filter((stdioItemOne, indexOne) => stdioItems.every((stdioItemTwo, indexTwo) => !hasSameValueAndDirection(stdioItemOne, stdioItemTwo) || indexOne >= indexTwo || stdioItemOne.type === "generator" || stdioItemOne.type === "asyncGenerator"));
var hasSameValueAndDirection = (stdioItemOne, stdioItemTwo) => stdioItemOne.value === stdioItemTwo.value && stdioItemOne.direction === stdioItemTwo.direction;
var getDuplicateStream = ({ stdioItem: { type, value, optionName }, direction, fileDescriptors, isSync }) => {
  const otherStdioItems = getOtherStdioItems(fileDescriptors, type);
  if (otherStdioItems.length === 0) {
    return;
  }
  if (isSync) {
    validateDuplicateStreamSync({
      otherStdioItems,
      type,
      value,
      optionName,
      direction
    });
    return;
  }
  if (SPECIAL_DUPLICATE_TYPES.has(type)) {
    return getDuplicateStreamInstance({
      otherStdioItems,
      type,
      value,
      optionName,
      direction
    });
  }
  if (FORBID_DUPLICATE_TYPES.has(type)) {
    validateDuplicateTransform({
      otherStdioItems,
      type,
      value,
      optionName
    });
  }
};
var getOtherStdioItems = (fileDescriptors, type) => fileDescriptors.flatMap(({ direction, stdioItems }) => stdioItems.filter((stdioItem) => stdioItem.type === type).map(((stdioItem) => ({ ...stdioItem, direction }))));
var validateDuplicateStreamSync = ({ otherStdioItems, type, value, optionName, direction }) => {
  if (SPECIAL_DUPLICATE_TYPES_SYNC.has(type)) {
    getDuplicateStreamInstance({
      otherStdioItems,
      type,
      value,
      optionName,
      direction
    });
  }
};
var getDuplicateStreamInstance = ({ otherStdioItems, type, value, optionName, direction }) => {
  const duplicateStdioItems = otherStdioItems.filter((stdioItem) => hasSameValue(stdioItem, value));
  if (duplicateStdioItems.length === 0) {
    return;
  }
  const differentStdioItem = duplicateStdioItems.find((stdioItem) => stdioItem.direction !== direction);
  throwOnDuplicateStream(differentStdioItem, optionName, type);
  return direction === "output" ? duplicateStdioItems[0].stream : void 0;
};
var hasSameValue = ({ type, value }, secondValue) => {
  if (type === "filePath") {
    return value.file === secondValue.file;
  }
  if (type === "fileUrl") {
    return value.href === secondValue.href;
  }
  return value === secondValue;
};
var validateDuplicateTransform = ({ otherStdioItems, type, value, optionName }) => {
  const duplicateStdioItem = otherStdioItems.find(({ value: { transform } }) => transform === value.transform);
  throwOnDuplicateStream(duplicateStdioItem, optionName, type);
};
var throwOnDuplicateStream = (stdioItem, optionName, type) => {
  if (stdioItem !== void 0) {
    throw new TypeError(`The \`${stdioItem.optionName}\` and \`${optionName}\` options must not target ${TYPE_TO_MESSAGE[type]} that is the same.`);
  }
};

// node_modules/execa/lib/stdio/handle.js
var handleStdio = (addProperties3, options, verboseInfo, isSync) => {
  const stdio = normalizeStdioOption(options, verboseInfo, isSync);
  const initialFileDescriptors = stdio.map((stdioOption, fdNumber) => getFileDescriptor({
    stdioOption,
    fdNumber,
    options,
    isSync
  }));
  const fileDescriptors = getFinalFileDescriptors({
    initialFileDescriptors,
    addProperties: addProperties3,
    options,
    isSync
  });
  options.stdio = fileDescriptors.map(({ stdioItems }) => forwardStdio(stdioItems));
  return fileDescriptors;
};
var getFileDescriptor = ({ stdioOption, fdNumber, options, isSync }) => {
  const optionName = getStreamName(fdNumber);
  const { stdioItems: initialStdioItems, isStdioArray } = initializeStdioItems({
    stdioOption,
    fdNumber,
    options,
    optionName
  });
  const direction = getStreamDirection(initialStdioItems, fdNumber, optionName);
  const stdioItems = initialStdioItems.map((stdioItem) => handleNativeStream({
    stdioItem,
    isStdioArray,
    fdNumber,
    direction,
    isSync
  }));
  const normalizedStdioItems = normalizeTransforms(stdioItems, optionName, direction, options);
  const objectMode = getFdObjectMode(normalizedStdioItems, direction);
  validateFileObjectMode(normalizedStdioItems, objectMode);
  return { direction, objectMode, stdioItems: normalizedStdioItems };
};
var initializeStdioItems = ({ stdioOption, fdNumber, options, optionName }) => {
  const values = Array.isArray(stdioOption) ? stdioOption : [stdioOption];
  const inputStdioItems = handleInputOptions(options, fdNumber);
  const initialStdioItems = [
    ...omitInheritedStdin(values.map((value) => initializeStdioItem(value, optionName)), inputStdioItems),
    ...inputStdioItems
  ];
  const stdioItems = filterDuplicates(initialStdioItems);
  const isStdioArray = stdioItems.length > 1;
  validateStdioArray(stdioItems, isStdioArray, optionName);
  validateStreams(stdioItems);
  return { stdioItems, isStdioArray };
};
var omitInheritedStdin = (stdioItems, inputStdioItems) => inputStdioItems.length > 0 && isInheritedStdinOnly(stdioItems) ? [] : stdioItems;
var isInheritedStdinOnly = (stdioItems) => stdioItems.length === 1 && stdioItems[0].type === "native" && stdioItems[0].value === "inherit";
var initializeStdioItem = (value, optionName) => {
  if (isStdioValueObject(value)) {
    return initializeStdioValueObject(value, optionName);
  }
  return {
    type: getStdioItemType(value, optionName),
    value,
    optionName
  };
};
var initializeStdioValueObject = ({ value, input }, optionName) => {
  checkBooleanOption(input, `${optionName}.input`);
  return {
    type: getStdioItemType(value, optionName),
    value,
    direction: input ? "input" : void 0,
    optionName
  };
};
var validateStdioArray = (stdioItems, isStdioArray, optionName) => {
  if (stdioItems.length === 0) {
    throw new TypeError(`The \`${optionName}\` option must not be an empty array.`);
  }
  if (!isStdioArray) {
    return;
  }
  for (const { value, optionName: optionName2 } of stdioItems) {
    if (INVALID_STDIO_ARRAY_OPTIONS.has(value)) {
      throw new Error(`The \`${optionName2}\` option must not include \`${value}\`.`);
    }
  }
};
var INVALID_STDIO_ARRAY_OPTIONS = /* @__PURE__ */ new Set(["ignore"]);
var validateStreams = (stdioItems) => {
  for (const stdioItem of stdioItems) {
    validateFileStdio(stdioItem);
  }
};
var validateFileStdio = ({ type, value, optionName }) => {
  if (isRegularUrl(value)) {
    throw new TypeError(`The \`${optionName}: URL\` option must use the \`file:\` scheme.
For example, you can use the \`pathToFileURL()\` method of the \`url\` core module.`);
  }
  if (isUnknownStdioString(type, value)) {
    throw new TypeError(`The \`${optionName}: { file: '...' }\` option must be used instead of \`${optionName}: '...'\`.`);
  }
};
var validateFileObjectMode = (stdioItems, objectMode) => {
  if (!objectMode) {
    return;
  }
  const fileStdioItem = stdioItems.find(({ type }) => FILE_TYPES.has(type));
  if (fileStdioItem !== void 0) {
    throw new TypeError(`The \`${fileStdioItem.optionName}\` option cannot use both files and transforms in objectMode.`);
  }
};
var getFinalFileDescriptors = ({ initialFileDescriptors, addProperties: addProperties3, options, isSync }) => {
  const fileDescriptors = [];
  try {
    for (const fileDescriptor of initialFileDescriptors) {
      fileDescriptors.push(getFinalFileDescriptor({
        fileDescriptor,
        fileDescriptors,
        addProperties: addProperties3,
        options,
        isSync
      }));
    }
    return fileDescriptors;
  } catch (error) {
    cleanupCustomStreams(fileDescriptors);
    throw error;
  }
};
var getFinalFileDescriptor = ({
  fileDescriptor: { direction, objectMode, stdioItems },
  fileDescriptors,
  addProperties: addProperties3,
  options,
  isSync
}) => {
  const finalStdioItems = stdioItems.map((stdioItem) => addStreamProperties({
    stdioItem,
    addProperties: addProperties3,
    direction,
    options,
    fileDescriptors,
    isSync
  }));
  return { direction, objectMode, stdioItems: finalStdioItems };
};
var addStreamProperties = ({ stdioItem, addProperties: addProperties3, direction, options, fileDescriptors, isSync }) => {
  const duplicateStream = getDuplicateStream({
    stdioItem,
    direction,
    fileDescriptors,
    isSync
  });
  if (duplicateStream !== void 0) {
    return { ...stdioItem, stream: duplicateStream };
  }
  return {
    ...stdioItem,
    ...addProperties3[direction][stdioItem.type](stdioItem, options)
  };
};
var cleanupCustomStreams = (fileDescriptors) => {
  for (const { stdioItems } of fileDescriptors) {
    for (const { stream } of stdioItems) {
      if (stream !== void 0 && !isStandardStream(stream)) {
        stream.destroy();
      }
    }
  }
};
var forwardStdio = (stdioItems) => {
  if (stdioItems.length > 1) {
    return stdioItems.some(({ value: value2 }) => value2 === "overlapped") ? "overlapped" : "pipe";
  }
  const [{ type, value }] = stdioItems;
  return type === "native" ? value : "pipe";
};

// node_modules/execa/lib/stdio/handle-sync.js
var handleStdioSync = (options, verboseInfo) => handleStdio(addPropertiesSync, options, verboseInfo, true);
var forbiddenIfSync = ({ type, optionName }) => {
  throwInvalidSyncValue(optionName, TYPE_TO_MESSAGE[type]);
};
var forbiddenNativeIfSync = ({ optionName, value }) => {
  if (value === "overlapped") {
    throwInvalidSyncValue(optionName, `"${value}"`);
  }
  return {};
};
var forbiddenNativeInputIfSync = (stdioItem) => {
  const { optionName, value } = stdioItem;
  if (value === "pipe" && optionName !== "stdin") {
    throw new TypeError(`Only the \`stdin\` option, not \`${optionName}\`, can be an input pipe with synchronous methods.`);
  }
  return forbiddenNativeIfSync(stdioItem);
};
var throwInvalidSyncValue = (optionName, value) => {
  throw new TypeError(`The \`${optionName}\` option cannot be ${value} with synchronous methods.`);
};
var addProperties = {
  generator() {
  },
  asyncGenerator: forbiddenIfSync,
  webStream: forbiddenIfSync,
  nodeStream: forbiddenIfSync,
  webTransform: forbiddenIfSync,
  duplex: forbiddenIfSync,
  asyncIterable: forbiddenIfSync,
  native: forbiddenNativeIfSync
};
var addPropertiesSync = {
  input: {
    ...addProperties,
    native: forbiddenNativeInputIfSync,
    fileUrl: ({ value }) => ({ contents: [bufferToUint8Array(readFileSync2(value))] }),
    filePath: ({ value: { file } }) => ({ contents: [bufferToUint8Array(readFileSync2(file))] }),
    fileNumber: forbiddenIfSync,
    iterable: ({ value }) => ({ contents: [...value] }),
    string: ({ value }) => ({ contents: [value] }),
    uint8Array: ({ value }) => ({ contents: [value] })
  },
  output: {
    ...addProperties,
    fileUrl: ({ value }) => ({ path: value }),
    filePath: ({ value: { file, append } }) => ({ path: file, append }),
    fileNumber: ({ value }) => ({ path: value }),
    iterable: forbiddenIfSync,
    string: forbiddenIfSync,
    uint8Array: forbiddenIfSync
  }
};

// node_modules/execa/lib/io/strip-newline.js
var stripNewline = (value, { stripFinalNewline: stripFinalNewline2 }, fdNumber) => getStripFinalNewline(stripFinalNewline2, fdNumber) && value !== void 0 && !Array.isArray(value) ? stripFinalNewline(value) : value;
var getStripFinalNewline = (stripFinalNewline2, fdNumber) => fdNumber === "all" ? stripFinalNewline2[1] || stripFinalNewline2[2] : stripFinalNewline2[fdNumber];

// node_modules/execa/lib/transform/generator.js
import { Transform, getDefaultHighWaterMark } from "node:stream";

// node_modules/execa/lib/transform/split.js
var getSplitLinesGenerator = (binary, preserveNewlines, skipped, state) => binary || skipped ? void 0 : initializeSplitLines(preserveNewlines, state);
var splitLinesSync = (chunk, preserveNewlines, objectMode) => objectMode ? chunk.flatMap((item) => splitLinesItemSync(item, preserveNewlines)) : splitLinesItemSync(chunk, preserveNewlines);
var splitLinesItemSync = (chunk, preserveNewlines) => {
  const { transform, final } = initializeSplitLines(preserveNewlines, {});
  return [...transform(chunk), ...final()];
};
var initializeSplitLines = (preserveNewlines, state) => {
  state.previousChunks = "";
  return {
    transform: splitGenerator.bind(void 0, state, preserveNewlines),
    final: linesFinal.bind(void 0, state)
  };
};
var splitGenerator = function* (state, preserveNewlines, chunk) {
  if (typeof chunk !== "string") {
    yield chunk;
    return;
  }
  let { previousChunks } = state;
  let start = -1;
  for (let end = 0; end < chunk.length; end += 1) {
    if (chunk[end] !== "\n") {
      continue;
    }
    const newlineLength = getNewlineLength(chunk, end, preserveNewlines, state);
    let line = chunk.slice(start + 1, end + 1 - newlineLength);
    if (previousChunks.length > 0) {
      line = concatString(previousChunks, line);
      previousChunks = "";
    }
    yield line;
    start = end;
  }
  if (start !== chunk.length - 1) {
    previousChunks = concatString(previousChunks, chunk.slice(start + 1));
  }
  state.previousChunks = previousChunks;
};
var getNewlineLength = (chunk, end, preserveNewlines, state) => {
  if (preserveNewlines) {
    return 0;
  }
  state.isWindowsNewline = end !== 0 && chunk[end - 1] === "\r";
  return state.isWindowsNewline ? 2 : 1;
};
var linesFinal = function* ({ previousChunks }) {
  if (previousChunks.length > 0) {
    yield previousChunks;
  }
};
var getAppendNewlineGenerator = ({ binary, preserveNewlines, readableObjectMode, state }) => binary || preserveNewlines || readableObjectMode ? void 0 : { transform: appendNewlineGenerator.bind(void 0, state) };
var appendNewlineGenerator = function* ({ isWindowsNewline = false }, chunk) {
  const { unixNewline, windowsNewline, LF: LF2, concatBytes } = typeof chunk === "string" ? linesStringInfo : linesUint8ArrayInfo;
  if (chunk.at(-1) === LF2) {
    yield chunk;
    return;
  }
  const newline = isWindowsNewline ? windowsNewline : unixNewline;
  yield concatBytes(chunk, newline);
};
var concatString = (firstChunk, secondChunk) => `${firstChunk}${secondChunk}`;
var linesStringInfo = {
  windowsNewline: "\r\n",
  unixNewline: "\n",
  LF: "\n",
  concatBytes: concatString
};
var concatUint8Array = (firstChunk, secondChunk) => {
  const chunk = new Uint8Array(firstChunk.length + secondChunk.length);
  chunk.set(firstChunk, 0);
  chunk.set(secondChunk, firstChunk.length);
  return chunk;
};
var linesUint8ArrayInfo = {
  windowsNewline: new Uint8Array([13, 10]),
  unixNewline: new Uint8Array([10]),
  LF: 10,
  concatBytes: concatUint8Array
};

// node_modules/execa/lib/transform/validate.js
import { Buffer as Buffer3 } from "node:buffer";
var getValidateTransformInput = (writableObjectMode, optionName) => writableObjectMode ? void 0 : validateStringTransformInput.bind(void 0, optionName);
var validateStringTransformInput = function* (optionName, chunk) {
  if (typeof chunk !== "string" && !isUint8Array(chunk) && !Buffer3.isBuffer(chunk)) {
    throw new TypeError(`The \`${optionName}\` option's transform must use "objectMode: true" to receive as input: ${typeof chunk}.`);
  }
  yield chunk;
};
var getValidateTransformReturn = (readableObjectMode, optionName) => readableObjectMode ? validateObjectTransformReturn.bind(void 0, optionName) : validateStringTransformReturn.bind(void 0, optionName);
var validateObjectTransformReturn = function* (optionName, chunk) {
  validateEmptyReturn(optionName, chunk);
  yield chunk;
};
var validateStringTransformReturn = function* (optionName, chunk) {
  validateEmptyReturn(optionName, chunk);
  if (typeof chunk !== "string" && !isUint8Array(chunk)) {
    throw new TypeError(`The \`${optionName}\` option's function must yield a string or an Uint8Array, not ${typeof chunk}.`);
  }
  yield chunk;
};
var validateEmptyReturn = (optionName, chunk) => {
  if (chunk === null || chunk === void 0) {
    throw new TypeError(`The \`${optionName}\` option's function must not call \`yield ${chunk}\`.
Instead, \`yield\` should either be called with a value, or not be called at all. For example:
  if (condition) { yield value; }`);
  }
};

// node_modules/execa/lib/transform/encoding-transform.js
import { Buffer as Buffer4 } from "node:buffer";
import { StringDecoder as StringDecoder2 } from "node:string_decoder";
var getEncodingTransformGenerator = (binary, encoding, skipped) => {
  if (skipped) {
    return;
  }
  if (binary) {
    return { transform: encodingUint8ArrayGenerator.bind(void 0, new TextEncoder()) };
  }
  const stringDecoder = new StringDecoder2(encoding);
  return {
    transform: encodingStringGenerator.bind(void 0, stringDecoder),
    final: encodingStringFinal.bind(void 0, stringDecoder)
  };
};
var encodingUint8ArrayGenerator = function* (textEncoder3, chunk) {
  if (Buffer4.isBuffer(chunk)) {
    yield bufferToUint8Array(chunk);
  } else if (typeof chunk === "string") {
    yield textEncoder3.encode(chunk);
  } else {
    yield chunk;
  }
};
var encodingStringGenerator = function* (stringDecoder, chunk) {
  yield isUint8Array(chunk) ? stringDecoder.write(chunk) : chunk;
};
var encodingStringFinal = function* (stringDecoder) {
  const lastChunk = stringDecoder.end();
  if (lastChunk !== "") {
    yield lastChunk;
  }
};

// node_modules/execa/lib/transform/run-async.js
import { callbackify } from "node:util";
var pushChunks = callbackify(async (getChunks, state, getChunksArguments, transformStream2) => {
  state.currentIterable = getChunks(...getChunksArguments);
  try {
    for await (const chunk of state.currentIterable) {
      transformStream2.push(chunk);
    }
  } finally {
    delete state.currentIterable;
  }
});
var transformChunk = async function* (chunk, generators, index) {
  if (index === generators.length) {
    yield chunk;
    return;
  }
  const { transform = identityGenerator } = generators[index];
  for await (const transformedChunk of transform(chunk)) {
    yield* transformChunk(transformedChunk, generators, index + 1);
  }
};
var finalChunks = async function* (generators) {
  for (const [index, { final }] of Object.entries(generators)) {
    yield* generatorFinalChunks(final, Number(index), generators);
  }
};
var generatorFinalChunks = async function* (final, index, generators) {
  if (final === void 0) {
    return;
  }
  for await (const finalChunk of final()) {
    yield* transformChunk(finalChunk, generators, index + 1);
  }
};
var destroyTransform = callbackify(async ({ currentIterable }, error) => {
  if (currentIterable !== void 0) {
    await (error ? currentIterable.throw(error) : currentIterable.return());
    return;
  }
  if (error) {
    throw error;
  }
});
var identityGenerator = function* (chunk) {
  yield chunk;
};

// node_modules/execa/lib/transform/run-sync.js
var pushChunksSync = (getChunksSync, getChunksArguments, transformStream2, done) => {
  try {
    for (const chunk of getChunksSync(...getChunksArguments)) {
      transformStream2.push(chunk);
    }
    done();
  } catch (error) {
    done(error);
  }
};
var runTransformSync = (generators, chunks) => [
  ...chunks.flatMap((chunk) => [...transformChunkSync(chunk, generators, 0)]),
  ...finalChunksSync(generators)
];
var transformChunkSync = function* (chunk, generators, index) {
  if (index === generators.length) {
    yield chunk;
    return;
  }
  const { transform = identityGenerator2 } = generators[index];
  for (const transformedChunk of transform(chunk)) {
    yield* transformChunkSync(transformedChunk, generators, index + 1);
  }
};
var finalChunksSync = function* (generators) {
  for (const [index, { final }] of Object.entries(generators)) {
    yield* generatorFinalChunksSync(final, Number(index), generators);
  }
};
var generatorFinalChunksSync = function* (final, index, generators) {
  if (final === void 0) {
    return;
  }
  for (const finalChunk of final()) {
    yield* transformChunkSync(finalChunk, generators, index + 1);
  }
};
var identityGenerator2 = function* (chunk) {
  yield chunk;
};

// node_modules/execa/lib/transform/generator.js
var generatorToStream = ({
  value,
  value: { transform, final, writableObjectMode, readableObjectMode },
  optionName
}, { encoding }) => {
  const state = {};
  const generators = addInternalGenerators(value, encoding, optionName);
  const transformAsync = isAsyncGenerator(transform);
  const finalAsync = isAsyncGenerator(final);
  const transformMethod = transformAsync ? pushChunks.bind(void 0, transformChunk, state) : pushChunksSync.bind(void 0, transformChunkSync);
  const finalMethod = transformAsync || finalAsync ? pushChunks.bind(void 0, finalChunks, state) : pushChunksSync.bind(void 0, finalChunksSync);
  const destroyMethod = transformAsync || finalAsync ? destroyTransform.bind(void 0, state) : void 0;
  const stream = new Transform({
    writableObjectMode,
    writableHighWaterMark: getDefaultHighWaterMark(writableObjectMode),
    readableObjectMode,
    readableHighWaterMark: getDefaultHighWaterMark(readableObjectMode),
    transform(chunk, encoding2, done) {
      transformMethod([chunk, generators, 0], this, done);
    },
    flush(done) {
      finalMethod([generators], this, done);
    },
    destroy: destroyMethod
  });
  return { stream };
};
var runGeneratorsSync = (chunks, stdioItems, encoding, isInput) => {
  const generators = stdioItems.filter(({ type }) => type === "generator");
  const reversedGenerators = isInput ? generators.reverse() : generators;
  for (const { value, optionName } of reversedGenerators) {
    const generators2 = addInternalGenerators(value, encoding, optionName);
    chunks = runTransformSync(generators2, chunks);
  }
  return chunks;
};
var addInternalGenerators = ({ transform, final, binary, writableObjectMode, readableObjectMode, preserveNewlines }, encoding, optionName) => {
  const state = {};
  return [
    { transform: getValidateTransformInput(writableObjectMode, optionName) },
    getEncodingTransformGenerator(binary, encoding, writableObjectMode),
    getSplitLinesGenerator(binary, preserveNewlines, writableObjectMode, state),
    { transform, final },
    { transform: getValidateTransformReturn(readableObjectMode, optionName) },
    getAppendNewlineGenerator({
      binary,
      preserveNewlines,
      readableObjectMode,
      state
    })
  ].filter(Boolean);
};

// node_modules/execa/lib/io/input-sync.js
var addInputOptionsSync = (fileDescriptors, options) => {
  for (const fdNumber of getInputFdNumbers(fileDescriptors)) {
    addInputOptionSync(fileDescriptors, fdNumber, options);
  }
};
var getInputFdNumbers = (fileDescriptors) => new Set(Object.entries(fileDescriptors).filter(([, { direction }]) => direction === "input").map(([fdNumber]) => Number(fdNumber)));
var addInputOptionSync = (fileDescriptors, fdNumber, options) => {
  const { stdioItems } = fileDescriptors[fdNumber];
  const allStdioItems = stdioItems.filter(({ contents }) => contents !== void 0);
  if (allStdioItems.length === 0) {
    return;
  }
  if (fdNumber !== 0) {
    const [{ type, optionName }] = allStdioItems;
    throw new TypeError(`Only the \`stdin\` option, not \`${optionName}\`, can be ${TYPE_TO_MESSAGE[type]} with synchronous methods.`);
  }
  const allContents = allStdioItems.map(({ contents }) => contents);
  const transformedContents = allContents.map((contents) => applySingleInputGeneratorsSync(contents, stdioItems));
  options.input = joinToUint8Array(transformedContents);
};
var applySingleInputGeneratorsSync = (contents, stdioItems) => {
  const newContents = runGeneratorsSync(contents, stdioItems, "utf8", true);
  validateSerializable(newContents);
  return joinToUint8Array(newContents);
};
var validateSerializable = (newContents) => {
  const invalidItem = newContents.find((item) => typeof item !== "string" && !isUint8Array(item));
  if (invalidItem !== void 0) {
    throw new TypeError(`The \`stdin\` option is invalid: when passing objects as input, a transform must be used to serialize them to strings or Uint8Arrays: ${invalidItem}.`);
  }
};

// node_modules/execa/lib/io/output-sync.js
import { writeFileSync, appendFileSync } from "node:fs";

// node_modules/execa/lib/verbose/output.js
var shouldLogOutput = ({ stdioItems, encoding, verboseInfo, fdNumber }) => fdNumber !== "all" && isFullVerbose(verboseInfo, fdNumber) && !BINARY_ENCODINGS.has(encoding) && isFdVerbose(fdNumber) && (stdioItems.some(({ type, value }) => type === "native" && PIPED_STDIO_VALUES.has(value)) || stdioItems.every(({ type }) => TRANSFORM_TYPES.has(type)));
var isFdVerbose = (fdNumber) => fdNumber === 1 || fdNumber === 2;
var PIPED_STDIO_VALUES = /* @__PURE__ */ new Set(["pipe", "overlapped"]);
var logLines = async (linesIterable, stream, fdNumber, verboseInfo) => {
  for await (const line of linesIterable) {
    if (!isPipingStream(stream)) {
      logLine(line, fdNumber, verboseInfo);
    }
  }
};
var logLinesSync = (linesArray, fdNumber, verboseInfo) => {
  for (const line of linesArray) {
    logLine(line, fdNumber, verboseInfo);
  }
};
var isPipingStream = (stream) => stream._readableState.pipes.length > 0;
var logLine = (line, fdNumber, verboseInfo) => {
  const verboseMessage = serializeVerboseMessage(line);
  verboseLog({
    type: "output",
    verboseMessage,
    fdNumber,
    verboseInfo
  });
};

// node_modules/execa/lib/io/output-sync.js
var transformOutputSync = ({ fileDescriptors, syncResult: { output }, options, isMaxBuffer, verboseInfo }) => {
  if (output === null) {
    return { output: Array.from({ length: 3 }) };
  }
  const state = {};
  const outputFiles = /* @__PURE__ */ new Set();
  const transformedOutput = output.map((result, fdNumber) => transformOutputResultSync({
    result,
    fileDescriptors,
    fdNumber,
    state,
    outputFiles,
    isMaxBuffer,
    verboseInfo
  }, options));
  return { output: transformedOutput, ...state };
};
var transformOutputResultSync = ({ result, fileDescriptors, fdNumber, state, outputFiles, isMaxBuffer, verboseInfo }, { buffer, encoding, lines, stripFinalNewline: stripFinalNewline2, maxBuffer }) => {
  if (result === null) {
    return;
  }
  const truncatedResult = truncateMaxBufferSync(result, isMaxBuffer, maxBuffer);
  const uint8ArrayResult = bufferToUint8Array(truncatedResult);
  const { stdioItems, objectMode } = fileDescriptors[fdNumber];
  const chunks = runOutputGeneratorsSync([uint8ArrayResult], stdioItems, encoding, state);
  const { serializedResult, finalResult = serializedResult } = serializeChunks({
    chunks,
    objectMode,
    encoding,
    lines,
    stripFinalNewline: stripFinalNewline2,
    fdNumber
  });
  logOutputSync({
    serializedResult,
    fdNumber,
    state,
    verboseInfo,
    encoding,
    stdioItems,
    objectMode
  });
  const returnedResult = buffer[fdNumber] ? finalResult : void 0;
  try {
    if (state.error === void 0) {
      writeToFiles(serializedResult, stdioItems, outputFiles);
    }
    return returnedResult;
  } catch (error) {
    state.error = error;
    return returnedResult;
  }
};
var runOutputGeneratorsSync = (chunks, stdioItems, encoding, state) => {
  try {
    return runGeneratorsSync(chunks, stdioItems, encoding, false);
  } catch (error) {
    state.error = error;
    return chunks;
  }
};
var serializeChunks = ({ chunks, objectMode, encoding, lines, stripFinalNewline: stripFinalNewline2, fdNumber }) => {
  if (objectMode) {
    return { serializedResult: chunks };
  }
  if (encoding === "buffer") {
    return { serializedResult: joinToUint8Array(chunks) };
  }
  const serializedResult = joinToString(chunks, encoding);
  if (lines[fdNumber]) {
    return { serializedResult, finalResult: splitLinesSync(serializedResult, !stripFinalNewline2[fdNumber], objectMode) };
  }
  return { serializedResult };
};
var logOutputSync = ({ serializedResult, fdNumber, state, verboseInfo, encoding, stdioItems, objectMode }) => {
  if (!shouldLogOutput({
    stdioItems,
    encoding,
    verboseInfo,
    fdNumber
  })) {
    return;
  }
  const linesArray = splitLinesSync(serializedResult, false, objectMode);
  try {
    logLinesSync(linesArray, fdNumber, verboseInfo);
  } catch (error) {
    state.error ??= error;
  }
};
var writeToFiles = (serializedResult, stdioItems, outputFiles) => {
  const fileItems = stdioItems.filter(({ type }) => FILE_TYPES.has(type));
  for (const { path: path15, append } of fileItems) {
    const pathString = typeof path15 === "string" ? path15 : path15.toString();
    if (append || outputFiles.has(pathString)) {
      appendFileSync(path15, serializedResult);
    } else {
      outputFiles.add(pathString);
      writeFileSync(path15, serializedResult);
    }
  }
};

// node_modules/execa/lib/resolve/all-sync.js
var getAllSync = ([, stdout, stderr], options) => {
  if (!options.all) {
    return;
  }
  if (stdout === void 0) {
    return stderr;
  }
  if (stderr === void 0) {
    return stdout;
  }
  if (Array.isArray(stdout)) {
    return Array.isArray(stderr) ? [...stdout, ...stderr] : [...stdout, stripNewline(stderr, options, "all")];
  }
  if (Array.isArray(stderr)) {
    return [stripNewline(stdout, options, "all"), ...stderr];
  }
  if (isUint8Array(stdout) && isUint8Array(stderr)) {
    return concatUint8Arrays([stdout, stderr]);
  }
  return `${stdout}${stderr}`;
};

// node_modules/execa/lib/resolve/exit-async.js
import { once as once4 } from "node:events";
var waitForExit = async (subprocess, context) => {
  const [exitCode, signal] = await waitForExitOrError(subprocess);
  context.isForcefullyTerminated ??= false;
  return [exitCode, signal];
};
var waitForExitOrError = async (subprocess) => {
  const [spawnPayload, exitPayload] = await Promise.allSettled([
    once4(subprocess, "spawn"),
    once4(subprocess, "exit")
  ]);
  if (spawnPayload.status === "rejected") {
    return [];
  }
  return exitPayload.status === "rejected" ? waitForSubprocessExit(subprocess) : exitPayload.value;
};
var waitForSubprocessExit = async (subprocess) => {
  try {
    return await once4(subprocess, "exit");
  } catch {
    return waitForSubprocessExit(subprocess);
  }
};
var waitForSuccessfulExit = async (exitPromise) => {
  const [exitCode, signal] = await exitPromise;
  if (!isSubprocessErrorExit(exitCode, signal) && isFailedExit(exitCode, signal)) {
    throw new DiscardedError();
  }
  return [exitCode, signal];
};
var isSubprocessErrorExit = (exitCode, signal) => exitCode === void 0 && signal === void 0;
var isFailedExit = (exitCode, signal) => exitCode !== 0 || signal !== null;

// node_modules/execa/lib/resolve/exit-sync.js
var getExitResultSync = ({ error, status: exitCode, signal, output }, { maxBuffer }) => {
  const resultError = getResultError(error, exitCode, signal);
  const isTimedOut = resultError?.code === "ETIMEDOUT";
  const isMaxBuffer = isMaxBufferSync(resultError, output, maxBuffer);
  return {
    resultError,
    exitCode,
    signal,
    timedOut: isTimedOut,
    isMaxBuffer
  };
};
var getResultError = (error, exitCode, signal) => {
  if (error !== void 0) {
    return error;
  }
  return isFailedExit(exitCode, signal) ? new DiscardedError() : void 0;
};

// node_modules/execa/lib/methods/main-sync.js
var execaCoreSync = (rawFile, rawArguments, rawOptions) => {
  const { file, commandArguments, command, escapedCommand, startTime, verboseInfo, options, fileDescriptors } = handleSyncArguments(rawFile, rawArguments, rawOptions);
  const result = spawnSubprocessSync({
    file,
    commandArguments,
    options,
    command,
    escapedCommand,
    verboseInfo,
    fileDescriptors,
    startTime
  });
  return handleResult(result, verboseInfo, options);
};
var handleSyncArguments = (rawFile, rawArguments, rawOptions) => {
  const { command, escapedCommand, startTime, verboseInfo } = handleCommand(rawFile, rawArguments, rawOptions);
  const syncOptions = normalizeSyncOptions(rawOptions);
  const { file, commandArguments, options } = normalizeOptions(rawFile, rawArguments, syncOptions);
  validateSyncOptions(options);
  const fileDescriptors = handleStdioSync(options, verboseInfo);
  return {
    file,
    commandArguments,
    command,
    escapedCommand,
    startTime,
    verboseInfo,
    options,
    fileDescriptors
  };
};
var normalizeSyncOptions = (options) => options.node && !options.ipc ? { ...options, ipc: false } : options;
var validateSyncOptions = ({ ipc, ipcInput, detached, cancelSignal, killDescendants }) => {
  if (ipcInput) {
    throwInvalidSyncOption("ipcInput");
  }
  if (ipc) {
    throwInvalidSyncOption("ipc: true");
  }
  if (detached) {
    throwInvalidSyncOption("detached: true");
  }
  if (killDescendants) {
    throwInvalidSyncOption("killDescendants: true");
  }
  if (cancelSignal) {
    throwInvalidSyncOption("cancelSignal");
  }
};
var throwInvalidSyncOption = (value) => {
  throw new TypeError(`The "${value}" option cannot be used with synchronous methods.`);
};
var spawnSubprocessSync = ({ file, commandArguments, options, command, escapedCommand, verboseInfo, fileDescriptors, startTime }) => {
  const syncResult = runSubprocessSync({
    file,
    commandArguments,
    options,
    command,
    escapedCommand,
    fileDescriptors,
    startTime
  });
  if (syncResult.failed) {
    return syncResult;
  }
  const { resultError, exitCode, signal, timedOut, isMaxBuffer } = getExitResultSync(syncResult, options);
  const { output, error = resultError } = transformOutputSync({
    fileDescriptors,
    syncResult,
    options,
    isMaxBuffer,
    verboseInfo
  });
  const stdio = output.map((stdioOutput, fdNumber) => stripNewline(stdioOutput, options, fdNumber));
  const all = stripNewline(getAllSync(output, options), options, "all");
  return getSyncResult({
    error,
    exitCode,
    signal,
    timedOut,
    isMaxBuffer,
    stdio,
    all,
    options,
    command,
    escapedCommand,
    startTime
  });
};
var runSubprocessSync = ({ file, commandArguments, options, command, escapedCommand, fileDescriptors, startTime }) => {
  try {
    addInputOptionsSync(fileDescriptors, options);
    const normalizedOptions = normalizeSpawnSyncOptions(options);
    return spawnSync(...concatenateShell(file, commandArguments, normalizedOptions));
  } catch (error) {
    return makeEarlyError({
      error,
      command,
      escapedCommand,
      fileDescriptors,
      options,
      startTime,
      isSync: true
    });
  }
};
var normalizeSpawnSyncOptions = ({ encoding, maxBuffer, ...options }) => ({ ...options, encoding: "buffer", maxBuffer: getMaxBufferSync(maxBuffer) });
var getSyncResult = ({ error, exitCode, signal, timedOut, isMaxBuffer, stdio, all, options, command, escapedCommand, startTime }) => error === void 0 ? makeSuccessResult({
  command,
  escapedCommand,
  stdio,
  all,
  ipcOutput: [],
  options,
  startTime
}) : makeError({
  error,
  command,
  escapedCommand,
  timedOut,
  isCanceled: false,
  isGracefullyCanceled: false,
  isMaxBuffer,
  isForcefullyTerminated: false,
  exitCode,
  signal,
  stdio,
  all,
  ipcOutput: [],
  options,
  startTime,
  isSync: true
});

// node_modules/execa/lib/methods/main-async.js
import { setMaxListeners } from "node:events";
import { spawn } from "node:child_process";

// node_modules/execa/lib/ipc/methods.js
import process10 from "node:process";

// node_modules/execa/lib/ipc/get-one.js
import { once as once5, on as on2 } from "node:events";
var internalGetOneMessageOptions = /* @__PURE__ */ Symbol("internalGetOneMessageOptions");
var getOneMessage = ({ anyProcess, channel, isSubprocess, ipc }, options = {}) => {
  const { reference = true, filter } = options;
  const { signal } = options[internalGetOneMessageOptions] ?? {};
  validateIpcMethod({
    methodName: "getOneMessage",
    isSubprocess,
    ipc,
    isConnected: isConnected(anyProcess)
  });
  return getOneMessageAsync({
    anyProcess,
    channel,
    isSubprocess,
    filter,
    reference,
    signal
  });
};
var getOneMessageAsync = async ({ anyProcess, channel, isSubprocess, filter, reference, signal }) => {
  addReference(channel, reference);
  const ipcEmitter = getIpcEmitter(anyProcess, channel, isSubprocess);
  const controller = new AbortController();
  stopOnAbort(signal, controller);
  try {
    return await Promise.race([
      getMessage(ipcEmitter, filter, controller),
      throwOnDisconnect2(ipcEmitter, isSubprocess, controller),
      throwOnStrictError(ipcEmitter, isSubprocess, controller)
    ]);
  } catch (error) {
    disconnect(anyProcess);
    throw error;
  } finally {
    controller.abort();
    removeReference(channel, reference);
  }
};
var stopOnAbort = (signal, controller) => {
  if (signal === void 0) {
    return;
  }
  if (signal.aborted) {
    controller.abort();
    return;
  }
  signal.addEventListener("abort", () => {
    controller.abort();
  }, { once: true, signal: controller.signal });
};
var getMessage = async (ipcEmitter, filter, { signal }) => {
  if (filter === void 0) {
    const [message] = await once5(ipcEmitter, "message", { signal });
    return message;
  }
  for await (const [message] of on2(ipcEmitter, "message", { signal })) {
    if (filter(message)) {
      return message;
    }
  }
};
var throwOnDisconnect2 = async (ipcEmitter, isSubprocess, { signal }) => {
  await once5(ipcEmitter, "disconnect", { signal });
  throwOnEarlyDisconnect(isSubprocess);
};
var throwOnStrictError = async (ipcEmitter, isSubprocess, { signal }) => {
  const [error] = await once5(ipcEmitter, "strict:error", { signal });
  throw getStrictResponseError(error, isSubprocess);
};

// node_modules/execa/lib/ipc/get-each.js
import { once as once6, on as on3 } from "node:events";
var internalGetEachMessageOptions = /* @__PURE__ */ Symbol("internalGetEachMessageOptions");
var getEachMessage = (subprocessInfo, options = {}) => {
  const { reference = true } = options;
  const { signal, shouldAwait = !subprocessInfo.isSubprocess } = options[internalGetEachMessageOptions] ?? {};
  return loopOnMessages({
    ...subprocessInfo,
    shouldAwait,
    reference,
    signal
  });
};
var loopOnMessages = ({ anyProcess, waitProcess = anyProcess, channel, isSubprocess, ipc, shouldAwait, reference, signal }) => {
  validateIpcMethod({
    methodName: "getEachMessage",
    isSubprocess,
    ipc,
    isConnected: isConnected(anyProcess)
  });
  addReference(channel, reference);
  const ipcEmitter = getIpcEmitter(anyProcess, channel, isSubprocess);
  const controller = new AbortController();
  const state = {};
  stopOnAbort2(signal, controller);
  stopOnDisconnect(anyProcess, ipcEmitter, controller);
  abortOnStrictError({
    ipcEmitter,
    isSubprocess,
    controller,
    state
  });
  return iterateOnMessages({
    anyProcess,
    waitProcess,
    channel,
    ipcEmitter,
    isSubprocess,
    shouldAwait,
    controller,
    state,
    reference
  });
};
var stopOnAbort2 = (signal, controller) => {
  if (signal === void 0) {
    return;
  }
  if (signal.aborted) {
    controller.abort();
    return;
  }
  signal.addEventListener("abort", () => {
    controller.abort();
  }, { once: true, signal: controller.signal });
};
var stopOnDisconnect = async (anyProcess, ipcEmitter, controller) => {
  try {
    await once6(ipcEmitter, "disconnect", { signal: controller.signal });
    controller.abort();
  } catch {
  }
};
var abortOnStrictError = async ({ ipcEmitter, isSubprocess, controller, state }) => {
  try {
    const [error] = await once6(ipcEmitter, "strict:error", { signal: controller.signal });
    state.error = getStrictResponseError(error, isSubprocess);
    controller.abort();
  } catch {
  }
};
var iterateOnMessages = async function* ({ anyProcess, waitProcess, channel, ipcEmitter, isSubprocess, shouldAwait, controller, state, reference }) {
  try {
    for await (const [message] of on3(ipcEmitter, "message", { signal: controller.signal })) {
      throwIfStrictError(state);
      yield message;
    }
  } catch {
    throwIfStrictError(state);
  } finally {
    controller.abort();
    removeReference(channel, reference);
    if (!isSubprocess) {
      disconnect(anyProcess);
    }
    if (shouldAwait) {
      await waitProcess;
    }
  }
};
var throwIfStrictError = ({ error }) => {
  if (error) {
    throw error;
  }
};

// node_modules/execa/lib/ipc/methods.js
var addIpcMethods = (target, subprocess, { ipc }) => {
  Object.assign(target, getIpcMethods(subprocess, false, ipc, target));
};
var getIpcExport = () => {
  const anyProcess = process10;
  const isSubprocess = true;
  const isIpc = process10.channel !== void 0;
  return {
    ...getIpcMethods(anyProcess, isSubprocess, isIpc),
    getCancelSignal: getCancelSignal.bind(void 0, {
      anyProcess,
      channel: anyProcess.channel,
      isSubprocess,
      ipc: isIpc
    })
  };
};
var getIpcMethods = (anyProcess, isSubprocess, ipc, waitProcess = anyProcess) => ({
  sendMessage: sendMessage.bind(void 0, {
    anyProcess,
    channel: anyProcess.channel,
    isSubprocess,
    ipc
  }),
  getOneMessage: getOneMessage.bind(void 0, {
    anyProcess,
    channel: anyProcess.channel,
    isSubprocess,
    ipc
  }),
  getEachMessage: getEachMessage.bind(void 0, {
    anyProcess,
    channel: anyProcess.channel,
    isSubprocess,
    ipc,
    waitProcess
  })
});

// node_modules/execa/lib/return/early-error.js
import { ChildProcess as ChildProcess2 } from "node:child_process";
import {
  PassThrough,
  Readable,
  Writable,
  Duplex
} from "node:stream";
var handleEarlyError = ({ error, command, escapedCommand, fileDescriptors, options, startTime, verboseInfo }) => {
  cleanupCustomStreams(fileDescriptors);
  const subprocess = new ChildProcess2();
  const all = createDummyStreams(subprocess, fileDescriptors);
  const earlyError = makeEarlyError({
    error,
    command,
    escapedCommand,
    fileDescriptors,
    options,
    startTime,
    isSync: false
  });
  const promise = handleDummyPromise(earlyError, verboseInfo, options);
  return {
    subprocess,
    promise,
    all: options.all ? all : void 0,
    convertedStreams: {
      readable,
      writable,
      duplex,
      readableStream,
      writableStream,
      transformStream,
      iterable,
      [Symbol.asyncIterator]: iterable
    }
  };
};
var createDummyStreams = (subprocess, fileDescriptors) => {
  const stdin = createDummyStream();
  const stdout = createDummyStream();
  const stderr = createDummyStream();
  const extraStdio = Array.from({ length: fileDescriptors.length - 3 }, createDummyStream);
  const all = createDummyStream();
  const stdio = [stdin, stdout, stderr, ...extraStdio];
  Object.assign(subprocess, {
    stdin,
    stdout,
    stderr,
    stdio
  });
  return all;
};
var createDummyStream = () => {
  const stream = new PassThrough();
  stream.end();
  return stream;
};
var readable = () => new Readable({ read() {
} });
var writable = () => new Writable({ write() {
} });
var duplex = () => new Duplex({ read() {
}, write() {
} });
var readableStream = () => Readable.toWeb(readable());
var writableStream = () => Writable.toWeb(writable());
var transformStream = () => Duplex.toWeb(duplex());
var iterable = async function* () {
};
var handleDummyPromise = async (error, verboseInfo, options) => handleResult(error, verboseInfo, options);

// node_modules/execa/lib/stdio/handle-async.js
import { createReadStream, createWriteStream } from "node:fs";
import { Buffer as Buffer5 } from "node:buffer";
import { Readable as Readable2, Writable as Writable2, Duplex as Duplex2 } from "node:stream";
var handleStdioAsync = (options, verboseInfo) => handleStdio(addPropertiesAsync, options, verboseInfo, false);
var forbiddenIfAsync = ({ type, optionName }) => {
  throw new TypeError(`The \`${optionName}\` option cannot be ${TYPE_TO_MESSAGE[type]}.`);
};
var addProperties2 = {
  fileNumber: forbiddenIfAsync,
  generator: generatorToStream,
  asyncGenerator: generatorToStream,
  nodeStream: ({ value }) => ({ stream: value }),
  webTransform({ value: { transform, writableObjectMode, readableObjectMode } }) {
    const objectMode = writableObjectMode || readableObjectMode;
    const stream = Duplex2.fromWeb(transform, { objectMode });
    return { stream };
  },
  duplex: ({ value: { transform } }) => ({ stream: transform }),
  native() {
  }
};
var addPropertiesAsync = {
  input: {
    ...addProperties2,
    fileUrl: ({ value }) => ({ stream: createReadStream(value) }),
    filePath: ({ value: { file } }) => ({ stream: createReadStream(file) }),
    webStream: ({ value }) => ({ stream: Readable2.fromWeb(value) }),
    iterable: ({ value }) => ({ stream: Readable2.from(value) }),
    asyncIterable: ({ value }) => ({ stream: Readable2.from(value) }),
    string: ({ value }) => ({ stream: Readable2.from(value) }),
    uint8Array: ({ value }) => ({ stream: Readable2.from(Buffer5.from(value)) })
  },
  output: {
    ...addProperties2,
    fileUrl: ({ value }) => ({ stream: createWriteStream(value) }),
    filePath: ({ value: { file, append } }) => ({ stream: createWriteStream(file, append ? { flags: "a" } : {}) }),
    webStream: ({ value }) => ({ stream: Writable2.fromWeb(value) }),
    iterable: forbiddenIfAsync,
    asyncIterable: forbiddenIfAsync,
    string: forbiddenIfAsync,
    uint8Array: forbiddenIfAsync
  }
};

// node_modules/@sindresorhus/merge-streams/index.js
import { on as on4, once as once7 } from "node:events";
import { PassThrough as PassThroughStream, getDefaultHighWaterMark as getDefaultHighWaterMark2 } from "node:stream";
import { finished as finished2 } from "node:stream/promises";
function mergeStreams(streams) {
  if (!Array.isArray(streams)) {
    throw new TypeError(`Expected an array, got \`${typeof streams}\`.`);
  }
  for (const stream of streams) {
    validateStream(stream);
  }
  const objectMode = streams.some(({ readableObjectMode }) => readableObjectMode);
  const highWaterMark = getHighWaterMark(streams, objectMode);
  const passThroughStream = new MergedStream({
    objectMode,
    writableHighWaterMark: highWaterMark,
    readableHighWaterMark: highWaterMark
  });
  for (const stream of streams) {
    passThroughStream.add(stream);
  }
  return passThroughStream;
}
var getHighWaterMark = (streams, objectMode) => {
  if (streams.length === 0) {
    return getDefaultHighWaterMark2(objectMode);
  }
  const highWaterMarks = streams.filter(({ readableObjectMode }) => readableObjectMode === objectMode).map(({ readableHighWaterMark }) => readableHighWaterMark);
  return Math.max(...highWaterMarks);
};
var MergedStream = class extends PassThroughStream {
  #streams = /* @__PURE__ */ new Set([]);
  #ended = /* @__PURE__ */ new Set([]);
  #aborted = /* @__PURE__ */ new Set([]);
  #onFinished;
  #unpipeEvent = /* @__PURE__ */ Symbol("unpipe");
  #streamPromises = /* @__PURE__ */ new WeakMap();
  add(stream) {
    validateStream(stream);
    if (this.#streams.has(stream)) {
      return;
    }
    this.#streams.add(stream);
    this.#onFinished ??= onMergedStreamFinished(this, this.#streams, this.#unpipeEvent);
    const streamPromise = endWhenStreamsDone({
      passThroughStream: this,
      stream,
      streams: this.#streams,
      ended: this.#ended,
      aborted: this.#aborted,
      onFinished: this.#onFinished,
      unpipeEvent: this.#unpipeEvent
    });
    this.#streamPromises.set(stream, streamPromise);
    stream.pipe(this, { end: false });
  }
  async remove(stream) {
    validateStream(stream);
    if (!this.#streams.has(stream)) {
      return false;
    }
    const streamPromise = this.#streamPromises.get(stream);
    if (streamPromise === void 0) {
      return false;
    }
    this.#streamPromises.delete(stream);
    stream.unpipe(this);
    await streamPromise;
    return true;
  }
};
var onMergedStreamFinished = async (passThroughStream, streams, unpipeEvent) => {
  updateMaxListeners(passThroughStream, PASSTHROUGH_LISTENERS_COUNT);
  const controller = new AbortController();
  try {
    await Promise.race([
      onMergedStreamEnd(passThroughStream, controller),
      onInputStreamsUnpipe(passThroughStream, streams, unpipeEvent, controller)
    ]);
  } finally {
    controller.abort();
    updateMaxListeners(passThroughStream, -PASSTHROUGH_LISTENERS_COUNT);
  }
};
var onMergedStreamEnd = async (passThroughStream, { signal }) => {
  try {
    await finished2(passThroughStream, { signal, cleanup: true });
  } catch (error) {
    errorOrAbortStream(passThroughStream, error);
    throw error;
  }
};
var onInputStreamsUnpipe = async (passThroughStream, streams, unpipeEvent, { signal }) => {
  for await (const [unpipedStream] of on4(passThroughStream, "unpipe", { signal })) {
    if (streams.has(unpipedStream)) {
      unpipedStream.emit(unpipeEvent);
    }
  }
};
var validateStream = (stream) => {
  if (typeof stream?.pipe !== "function") {
    throw new TypeError(`Expected a readable stream, got: \`${typeof stream}\`.`);
  }
};
var endWhenStreamsDone = async ({ passThroughStream, stream, streams, ended, aborted: aborted2, onFinished, unpipeEvent }) => {
  updateMaxListeners(passThroughStream, PASSTHROUGH_LISTENERS_PER_STREAM);
  const controller = new AbortController();
  try {
    await Promise.race([
      afterMergedStreamFinished(onFinished, stream, controller),
      onInputStreamEnd({
        passThroughStream,
        stream,
        streams,
        ended,
        aborted: aborted2,
        controller
      }),
      onInputStreamUnpipe({
        stream,
        streams,
        ended,
        aborted: aborted2,
        unpipeEvent,
        controller
      })
    ]);
  } finally {
    controller.abort();
    updateMaxListeners(passThroughStream, -PASSTHROUGH_LISTENERS_PER_STREAM);
  }
  if (streams.size > 0 && streams.size === ended.size + aborted2.size) {
    if (ended.size === 0 && aborted2.size > 0) {
      abortStream(passThroughStream);
    } else {
      endStream(passThroughStream);
    }
  }
};
var afterMergedStreamFinished = async (onFinished, stream, { signal }) => {
  try {
    await onFinished;
    if (!signal.aborted) {
      abortStream(stream);
    }
  } catch (error) {
    if (!signal.aborted) {
      errorOrAbortStream(stream, error);
    }
  }
};
var onInputStreamEnd = async ({ passThroughStream, stream, streams, ended, aborted: aborted2, controller: { signal } }) => {
  try {
    await finished2(stream, {
      signal,
      cleanup: true,
      readable: true,
      writable: false
    });
    if (streams.has(stream)) {
      ended.add(stream);
    }
  } catch (error) {
    if (signal.aborted || !streams.has(stream)) {
      return;
    }
    if (isAbortError(error)) {
      aborted2.add(stream);
    } else {
      errorStream(passThroughStream, error);
    }
  }
};
var onInputStreamUnpipe = async ({ stream, streams, ended, aborted: aborted2, unpipeEvent, controller: { signal } }) => {
  await once7(stream, unpipeEvent, { signal });
  if (!stream.readable) {
    return once7(signal, "abort", { signal });
  }
  streams.delete(stream);
  ended.delete(stream);
  aborted2.delete(stream);
};
var endStream = (stream) => {
  if (stream.writable) {
    stream.end();
  }
};
var errorOrAbortStream = (stream, error) => {
  if (isAbortError(error)) {
    abortStream(stream);
  } else {
    errorStream(stream, error);
  }
};
var isAbortError = (error) => error?.code === "ERR_STREAM_PREMATURE_CLOSE";
var abortStream = (stream) => {
  if (stream.readable || stream.writable) {
    stream.destroy();
  }
};
var errorStream = (stream, error) => {
  if (!stream.destroyed) {
    stream.once("error", noop2);
    stream.destroy(error);
  }
};
var noop2 = () => {
};
var updateMaxListeners = (passThroughStream, increment2) => {
  const maxListeners = passThroughStream.getMaxListeners();
  if (maxListeners !== 0 && maxListeners !== Number.POSITIVE_INFINITY) {
    passThroughStream.setMaxListeners(maxListeners + increment2);
  }
};
var PASSTHROUGH_LISTENERS_COUNT = 2;
var PASSTHROUGH_LISTENERS_PER_STREAM = 1;

// node_modules/execa/lib/io/pipeline.js
import { finished as finished3 } from "node:stream/promises";
var pipeStreams = (source, destination) => {
  source.pipe(destination);
  onSourceFinish(source, destination);
  onDestinationFinish(source, destination);
};
var onSourceFinish = async (source, destination) => {
  if (isStandardStream(source) || isStandardStream(destination)) {
    return;
  }
  try {
    await finished3(source, { cleanup: true, readable: true, writable: false });
  } catch {
  }
  endDestinationStream(destination);
};
var endDestinationStream = (destination) => {
  if (destination.writable) {
    destination.end();
  }
};
var onDestinationFinish = async (source, destination) => {
  if (isStandardStream(source) || isStandardStream(destination)) {
    return;
  }
  try {
    await finished3(destination, { cleanup: true, readable: false, writable: true });
  } catch {
  }
  abortSourceStream(source);
};
var abortSourceStream = (source) => {
  if (source.readable) {
    source.destroy();
  }
};

// node_modules/execa/lib/io/output-async.js
var pipeOutputAsync = (subprocess, fileDescriptors, controller) => {
  const pipeGroups = /* @__PURE__ */ new Map();
  for (const [fdNumber, { stdioItems, direction }] of Object.entries(fileDescriptors)) {
    const transformItems = stdioItems.filter(({ type }) => TRANSFORM_TYPES.has(type));
    for (const { stream } of transformItems) {
      pipeTransform(subprocess, stream, direction, fdNumber);
    }
    const nonTransformItems = stdioItems.filter(({ type }) => !TRANSFORM_TYPES.has(type));
    for (const { stream } of nonTransformItems) {
      pipeStdioItem({
        subprocess,
        stream,
        direction,
        fdNumber,
        pipeGroups,
        controller
      });
    }
  }
  for (const [outputStream, inputStreams] of pipeGroups) {
    const inputStream = inputStreams.length === 1 ? inputStreams[0] : mergeStreams(inputStreams);
    pipeStreams(inputStream, outputStream);
  }
};
var pipeTransform = (subprocess, stream, direction, fdNumber) => {
  if (direction === "output") {
    pipeStreams(subprocess.stdio[fdNumber], stream);
  } else {
    pipeStreams(stream, subprocess.stdio[fdNumber]);
  }
  const streamProperty = SUBPROCESS_STREAM_PROPERTIES[fdNumber];
  if (streamProperty !== void 0) {
    subprocess[streamProperty] = stream;
  }
  subprocess.stdio[fdNumber] = stream;
};
var SUBPROCESS_STREAM_PROPERTIES = ["stdin", "stdout", "stderr"];
var pipeStdioItem = ({ subprocess, stream, direction, fdNumber, pipeGroups, controller }) => {
  if (stream === void 0) {
    return;
  }
  setStandardStreamMaxListeners(stream, controller);
  const [inputStream, outputStream] = direction === "output" ? [stream, subprocess.stdio[fdNumber]] : [subprocess.stdio[fdNumber], stream];
  const outputStreams = pipeGroups.get(inputStream) ?? [];
  pipeGroups.set(inputStream, [...outputStreams, outputStream]);
};
var setStandardStreamMaxListeners = (stream, { signal }) => {
  if (isStandardStream(stream)) {
    incrementMaxListeners(stream, MAX_LISTENERS_INCREMENT, signal);
  }
};
var MAX_LISTENERS_INCREMENT = 2;

// node_modules/execa/lib/terminate/kill-descendants.js
import process11 from "node:process";
import { execFile } from "node:child_process";
import path9 from "node:path/win32";
var isWindows2 = process11.platform === "win32";
var getSpawnOptions = (options) => options.killDescendants && !isWindows2 ? { ...options, detached: true } : options;
var getKillFunction = (subprocess, { killDescendants }) => {
  if (!killDescendants) {
    return subprocess.kill.bind(subprocess);
  }
  const killDescendantsFunction = isWindows2 ? killDescendantsWindows : killDescendantsUnix;
  return killDescendantsFunction.bind(void 0, subprocess);
};
var killDescendantsUnix = (subprocess, signal) => {
  if (subprocess.pid === void 0) {
    return false;
  }
  try {
    return process11.kill(-subprocess.pid, signal);
  } catch {
    return subprocess.kill(signal);
  }
};
var killDescendantsWindows = (subprocess, signal) => {
  if (subprocess.pid === void 0) {
    return false;
  }
  const taskkillFile = getTaskkillFile();
  if (taskkillFile === void 0) {
    return subprocess.kill(signal);
  }
  execFile(taskkillFile, ["/pid", `${subprocess.pid}`, "/T", "/F"], (error) => {
    if (error) {
      subprocess.kill(signal);
    }
  });
  return true;
};
var getTaskkillFile = () => {
  const windowsDirectory = [process11.env.SystemRoot, process11.env.windir].find((directory) => directory && isWindowsDriveAbsolutePath(directory));
  return windowsDirectory === void 0 ? void 0 : path9.join(windowsDirectory, "System32", "taskkill.exe");
};
var isWindowsDriveAbsolutePath = (directory) => {
  const { root } = path9.parse(directory);
  return /^[a-z]:[/\\]/i.test(root);
};

// node_modules/execa/lib/terminate/cleanup.js
import { addAbortListener as addAbortListener2 } from "node:events";

// node_modules/signal-exit/dist/mjs/signals.js
var signals = [];
signals.push("SIGHUP", "SIGINT", "SIGTERM");
if (process.platform !== "win32") {
  signals.push(
    "SIGALRM",
    "SIGABRT",
    "SIGVTALRM",
    "SIGXCPU",
    "SIGXFSZ",
    "SIGUSR2",
    "SIGTRAP",
    "SIGSYS",
    "SIGQUIT",
    "SIGIOT"
    // should detect profiler and enable/disable accordingly.
    // see #21
    // 'SIGPROF'
  );
}
if (process.platform === "linux") {
  signals.push("SIGIO", "SIGPOLL", "SIGPWR", "SIGSTKFLT");
}

// node_modules/signal-exit/dist/mjs/index.js
var processOk = (process13) => !!process13 && typeof process13 === "object" && typeof process13.removeListener === "function" && typeof process13.emit === "function" && typeof process13.reallyExit === "function" && typeof process13.listeners === "function" && typeof process13.kill === "function" && typeof process13.pid === "number" && typeof process13.on === "function";
var kExitEmitter = /* @__PURE__ */ Symbol.for("signal-exit emitter");
var global = globalThis;
var ObjectDefineProperty = Object.defineProperty.bind(Object);
var Emitter = class {
  emitted = {
    afterExit: false,
    exit: false
  };
  listeners = {
    afterExit: [],
    exit: []
  };
  count = 0;
  id = Math.random();
  constructor() {
    if (global[kExitEmitter]) {
      return global[kExitEmitter];
    }
    ObjectDefineProperty(global, kExitEmitter, {
      value: this,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
  on(ev, fn) {
    this.listeners[ev].push(fn);
  }
  removeListener(ev, fn) {
    const list = this.listeners[ev];
    const i2 = list.indexOf(fn);
    if (i2 === -1) {
      return;
    }
    if (i2 === 0 && list.length === 1) {
      list.length = 0;
    } else {
      list.splice(i2, 1);
    }
  }
  emit(ev, code, signal) {
    if (this.emitted[ev]) {
      return false;
    }
    this.emitted[ev] = true;
    let ret = false;
    for (const fn of this.listeners[ev]) {
      ret = fn(code, signal) === true || ret;
    }
    if (ev === "exit") {
      ret = this.emit("afterExit", code, signal) || ret;
    }
    return ret;
  }
};
var SignalExitBase = class {
};
var signalExitWrap = (handler) => {
  return {
    onExit(cb, opts) {
      return handler.onExit(cb, opts);
    },
    load() {
      return handler.load();
    },
    unload() {
      return handler.unload();
    }
  };
};
var SignalExitFallback = class extends SignalExitBase {
  onExit() {
    return () => {
    };
  }
  load() {
  }
  unload() {
  }
};
var SignalExit = class extends SignalExitBase {
  // "SIGHUP" throws an `ENOSYS` error on Windows,
  // so use a supported signal instead
  /* c8 ignore start */
  #hupSig = process12.platform === "win32" ? "SIGINT" : "SIGHUP";
  /* c8 ignore stop */
  #emitter = new Emitter();
  #process;
  #originalProcessEmit;
  #originalProcessReallyExit;
  #sigListeners = {};
  #loaded = false;
  constructor(process13) {
    super();
    this.#process = process13;
    this.#sigListeners = {};
    for (const sig of signals) {
      this.#sigListeners[sig] = () => {
        const listeners = this.#process.listeners(sig);
        let { count: count2 } = this.#emitter;
        const p = process13;
        if (typeof p.__signal_exit_emitter__ === "object" && typeof p.__signal_exit_emitter__.count === "number") {
          count2 += p.__signal_exit_emitter__.count;
        }
        if (listeners.length === count2) {
          this.unload();
          const ret = this.#emitter.emit("exit", null, sig);
          const s = sig === "SIGHUP" ? this.#hupSig : sig;
          if (!ret)
            process13.kill(process13.pid, s);
        }
      };
    }
    this.#originalProcessReallyExit = process13.reallyExit;
    this.#originalProcessEmit = process13.emit;
  }
  onExit(cb, opts) {
    if (!processOk(this.#process)) {
      return () => {
      };
    }
    if (this.#loaded === false) {
      this.load();
    }
    const ev = opts?.alwaysLast ? "afterExit" : "exit";
    this.#emitter.on(ev, cb);
    return () => {
      this.#emitter.removeListener(ev, cb);
      if (this.#emitter.listeners["exit"].length === 0 && this.#emitter.listeners["afterExit"].length === 0) {
        this.unload();
      }
    };
  }
  load() {
    if (this.#loaded) {
      return;
    }
    this.#loaded = true;
    this.#emitter.count += 1;
    for (const sig of signals) {
      try {
        const fn = this.#sigListeners[sig];
        if (fn)
          this.#process.on(sig, fn);
      } catch (_) {
      }
    }
    this.#process.emit = (ev, ...a2) => {
      return this.#processEmit(ev, ...a2);
    };
    this.#process.reallyExit = (code) => {
      return this.#processReallyExit(code);
    };
  }
  unload() {
    if (!this.#loaded) {
      return;
    }
    this.#loaded = false;
    signals.forEach((sig) => {
      const listener = this.#sigListeners[sig];
      if (!listener) {
        throw new Error("Listener not defined for signal: " + sig);
      }
      try {
        this.#process.removeListener(sig, listener);
      } catch (_) {
      }
    });
    this.#process.emit = this.#originalProcessEmit;
    this.#process.reallyExit = this.#originalProcessReallyExit;
    this.#emitter.count -= 1;
  }
  #processReallyExit(code) {
    if (!processOk(this.#process)) {
      return 0;
    }
    this.#process.exitCode = code || 0;
    this.#emitter.emit("exit", this.#process.exitCode, null);
    return this.#originalProcessReallyExit.call(this.#process, this.#process.exitCode);
  }
  #processEmit(ev, ...args) {
    const og = this.#originalProcessEmit;
    if (ev === "exit" && processOk(this.#process)) {
      if (typeof args[0] === "number") {
        this.#process.exitCode = args[0];
      }
      const ret = og.call(this.#process, ev, ...args);
      this.#emitter.emit("exit", this.#process.exitCode, null);
      return ret;
    } else {
      return og.call(this.#process, ev, ...args);
    }
  }
};
var process12 = globalThis.process;
var {
  /**
   * Called when the process is exiting, whether via signal, explicit
   * exit, or running out of stuff to do.
   *
   * If the global process object is not suitable for instrumentation,
   * then this will be a no-op.
   *
   * Returns a function that may be used to unload signal-exit.
   */
  onExit,
  /**
   * Load the listeners.  Likely you never need to call this, unless
   * doing a rather deep integration with signal-exit functionality.
   * Mostly exposed for the benefit of testing.
   *
   * @internal
   */
  load,
  /**
   * Unload the listeners.  Likely you never need to call this, unless
   * doing a rather deep integration with signal-exit functionality.
   * Mostly exposed for the benefit of testing.
   *
   * @internal
   */
  unload
} = signalExitWrap(processOk(process12) ? new SignalExit(process12) : new SignalExitFallback());

// node_modules/execa/lib/terminate/cleanup.js
var cleanupOnExit = (kill, { cleanup, detached }, { signal }) => {
  if (!cleanup || detached) {
    return;
  }
  const removeExitHandler = onExit(() => {
    kill();
  });
  addAbortListener2(signal, () => {
    removeExitHandler();
  });
};

// node_modules/execa/lib/convert/concurrent.js
var initializeConcurrentStreams = () => ({
  readableDestroy: /* @__PURE__ */ new WeakMap(),
  writableFinal: /* @__PURE__ */ new WeakMap(),
  writableDestroy: /* @__PURE__ */ new WeakMap()
});
var addConcurrentStream = (concurrentStreams, stream, waitName) => {
  const weakMap = concurrentStreams[waitName];
  if (!weakMap.has(stream)) {
    weakMap.set(stream, []);
  }
  const promises = weakMap.get(stream);
  const promise = createDeferred();
  promises.push(promise);
  const resolve = promise.resolve.bind(promise);
  return { resolve, promises };
};
var waitForConcurrentStreams = async ({ resolve, promises }, subprocess) => {
  resolve();
  const [isSubprocessExit] = await Promise.race([
    Promise.allSettled([true, subprocess]),
    Promise.all([false, ...promises])
  ]);
  return !isSubprocessExit;
};

// node_modules/execa/lib/io/iterate.js
import { on as on5 } from "node:events";
import { getDefaultHighWaterMark as getDefaultHighWaterMark3 } from "node:stream";
var iterateOnSubprocessStream = ({ subprocessStdout, subprocess, binary, shouldEncode, encoding, preserveNewlines }) => {
  const controller = new AbortController();
  stopReadingOnExit(subprocess, controller);
  return iterateOnStream({
    stream: subprocessStdout,
    controller,
    binary,
    shouldEncode: !subprocessStdout.readableObjectMode && shouldEncode,
    encoding,
    shouldSplit: !subprocessStdout.readableObjectMode,
    preserveNewlines
  });
};
var stopReadingOnExit = async (subprocess, controller) => {
  try {
    await subprocess;
  } catch {
  } finally {
    controller.abort();
  }
};
var iterateForResult = ({ stream, onStreamEnd, lines, encoding, stripFinalNewline: stripFinalNewline2, allMixed }) => {
  const controller = new AbortController();
  stopReadingOnStreamEnd(onStreamEnd, controller, stream);
  const objectMode = stream.readableObjectMode && !allMixed;
  return iterateOnStream({
    stream,
    controller,
    binary: encoding === "buffer",
    shouldEncode: !objectMode,
    encoding,
    shouldSplit: !objectMode && lines,
    preserveNewlines: !stripFinalNewline2
  });
};
var stopReadingOnStreamEnd = async (onStreamEnd, controller, stream) => {
  try {
    await onStreamEnd;
  } catch {
    stream.destroy();
  } finally {
    controller.abort();
  }
};
var iterateOnStream = ({ stream, controller, binary, shouldEncode, encoding, shouldSplit, preserveNewlines }) => {
  const onStdoutChunk = on5(stream, "data", {
    signal: controller.signal,
    highWaterMark: HIGH_WATER_MARK,
    // Backward compatibility with older name for this option
    // See https://github.com/nodejs/node/pull/52080#discussion_r1525227861
    // @todo Remove after removing support for Node 21
    highWatermark: HIGH_WATER_MARK
  });
  return iterateOnData({
    onStdoutChunk,
    controller,
    binary,
    shouldEncode,
    encoding,
    shouldSplit,
    preserveNewlines
  });
};
var DEFAULT_OBJECT_HIGH_WATER_MARK = getDefaultHighWaterMark3(true);
var HIGH_WATER_MARK = DEFAULT_OBJECT_HIGH_WATER_MARK;
var iterateOnData = async function* ({ onStdoutChunk, controller, binary, shouldEncode, encoding, shouldSplit, preserveNewlines }) {
  const generators = getGenerators({
    binary,
    shouldEncode,
    encoding,
    shouldSplit,
    preserveNewlines
  });
  try {
    for await (const [chunk] of onStdoutChunk) {
      yield* transformChunkSync(chunk, generators, 0);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
  } finally {
    yield* finalChunksSync(generators);
  }
};
var getGenerators = ({ binary, shouldEncode, encoding, shouldSplit, preserveNewlines }) => [
  getEncodingTransformGenerator(binary, encoding, !shouldEncode),
  getSplitLinesGenerator(binary, preserveNewlines, !shouldSplit, {})
].filter(Boolean);

// node_modules/execa/lib/convert/iterable.js
var createIterable = (subprocess, encoding, {
  from,
  binary: binaryOption = false,
  preserveNewlines = false
} = {}) => {
  const binary = binaryOption || BINARY_ENCODINGS.has(encoding);
  const subprocessStdout = getFromStream(subprocess, from);
  const onStdoutData = iterateOnSubprocessStream({
    subprocessStdout,
    subprocess,
    binary,
    shouldEncode: true,
    encoding,
    preserveNewlines
  });
  return iterateOnStdoutData(onStdoutData, subprocessStdout, subprocess);
};
var iterateOnStdoutData = async function* (onStdoutData, subprocessStdout, subprocess) {
  try {
    yield* onStdoutData;
  } finally {
    if (subprocessStdout.readable) {
      subprocessStdout.destroy();
    }
    await subprocess;
  }
};

// node_modules/execa/lib/convert/readable.js
import { Readable as Readable3 } from "node:stream";
import { callbackify as callbackify2 } from "node:util";

// node_modules/execa/lib/convert/shared.js
import { finished as finished5 } from "node:stream/promises";

// node_modules/execa/lib/resolve/wait-stream.js
import { finished as finished4 } from "node:stream/promises";
var waitForStream = async (stream, fdNumber, streamInfo, { isSameDirection, stopOnExit = false } = {}) => {
  const state = handleStdinDestroy(stream, streamInfo);
  const abortController = new AbortController();
  try {
    await Promise.race([
      ...stopOnExit ? [streamInfo.exitPromise] : [],
      finished4(stream, { cleanup: true, signal: abortController.signal })
    ]);
  } catch (error) {
    if (!state.stdinCleanedUp) {
      handleStreamError(error, fdNumber, streamInfo, isSameDirection);
    }
  } finally {
    abortController.abort();
  }
};
var handleStdinDestroy = (stream, { originalStreams, subprocess }) => {
  const [originalStdin] = originalStreams;
  const state = { stdinCleanedUp: false };
  if (stream === originalStdin) {
    spyOnStdinDestroy(stream, subprocess, state);
  }
  return state;
};
var spyOnStdinDestroy = (subprocessStdin, subprocess, state) => {
  const { _destroy } = subprocessStdin;
  subprocessStdin._destroy = (...destroyArguments) => {
    setStdinCleanedUp(subprocess, state);
    _destroy.call(subprocessStdin, ...destroyArguments);
  };
};
var setStdinCleanedUp = ({ exitCode, signalCode }, state) => {
  if (exitCode !== null || signalCode !== null) {
    state.stdinCleanedUp = true;
  }
};
var handleStreamError = (error, fdNumber, streamInfo, isSameDirection) => {
  if (!shouldIgnoreStreamError(error, fdNumber, streamInfo, isSameDirection)) {
    throw error;
  }
};
var shouldIgnoreStreamError = (error, fdNumber, streamInfo, isSameDirection = true) => {
  if (streamInfo.propagating) {
    return isStreamEpipe(error) || isStreamAbort(error);
  }
  streamInfo.propagating = true;
  return isInputFileDescriptor(streamInfo, fdNumber) === isSameDirection ? isStreamEpipe(error) : isStreamAbort(error);
};
var isInputFileDescriptor = ({ fileDescriptors }, fdNumber) => fdNumber !== "all" && fileDescriptors[fdNumber].direction === "input";
var isStreamAbort = (error) => error?.code === "ERR_STREAM_PREMATURE_CLOSE";
var isStreamEpipe = (error) => error?.code === "EPIPE";

// node_modules/execa/lib/convert/shared.js
var safeWaitForSubprocessStdin = async (subprocessStdin) => {
  if (subprocessStdin === void 0) {
    return;
  }
  try {
    await waitForSubprocessStdin(subprocessStdin);
  } catch {
  }
};
var safeWaitForSubprocessStdout = async (subprocessStdout) => {
  if (subprocessStdout === void 0) {
    return;
  }
  try {
    await waitForSubprocessStdout(subprocessStdout);
  } catch {
  }
};
var waitForSubprocessStdin = async (subprocessStdin) => {
  await finished5(subprocessStdin, { cleanup: true, readable: false, writable: true });
};
var waitForSubprocessStdout = async (subprocessStdout) => {
  await finished5(subprocessStdout, { cleanup: true, readable: true, writable: false });
};
var waitForSubprocess = async (subprocess, error) => {
  await subprocess;
  if (error) {
    throw error;
  }
};
var destroyOtherStream = (stream, isOpen, error) => {
  if (error && !isStreamAbort(error)) {
    stream.destroy(error);
  } else if (isOpen) {
    stream.destroy();
  }
};

// node_modules/execa/lib/convert/readable.js
var createReadable = ({ subprocess, concurrentStreams, encoding }, { from, binary: binaryOption = true, preserveNewlines = true } = {}) => {
  const binary = binaryOption || BINARY_ENCODINGS.has(encoding);
  const { subprocessStdout, waitReadableDestroy } = getSubprocessStdout(subprocess, from, concurrentStreams);
  const { readableEncoding, readableObjectMode, readableHighWaterMark } = getReadableOptions(subprocessStdout, binary);
  const { read, onStdoutDataDone } = getReadableMethods({
    subprocessStdout,
    subprocess,
    binary,
    encoding,
    preserveNewlines
  });
  const readable2 = new Readable3({
    read,
    destroy: callbackify2(onReadableDestroy.bind(void 0, { subprocessStdout, subprocess, waitReadableDestroy })),
    highWaterMark: readableHighWaterMark,
    objectMode: readableObjectMode,
    encoding: readableEncoding
  });
  onStdoutFinished({
    subprocessStdout,
    onStdoutDataDone,
    readable: readable2,
    subprocess
  });
  return readable2;
};
var getSubprocessStdout = (subprocess, from, concurrentStreams) => {
  const subprocessStdout = getFromStream(subprocess, from);
  const waitReadableDestroy = addConcurrentStream(concurrentStreams, subprocessStdout, "readableDestroy");
  return { subprocessStdout, waitReadableDestroy };
};
var getReadableOptions = ({ readableEncoding, readableObjectMode, readableHighWaterMark }, binary) => binary ? { readableEncoding, readableObjectMode, readableHighWaterMark } : { readableEncoding, readableObjectMode: true, readableHighWaterMark: DEFAULT_OBJECT_HIGH_WATER_MARK };
var getReadableMethods = ({ subprocessStdout, subprocess, binary, encoding, preserveNewlines }) => {
  const onStdoutDataDone = createDeferred();
  const onStdoutData = iterateOnSubprocessStream({
    subprocessStdout,
    subprocess,
    binary,
    shouldEncode: !binary,
    encoding,
    preserveNewlines
  });
  return {
    read() {
      onRead(this, onStdoutData, onStdoutDataDone);
    },
    onStdoutDataDone
  };
};
var onRead = async (readable2, onStdoutData, onStdoutDataDone) => {
  try {
    const { value, done } = await onStdoutData.next();
    if (done) {
      onStdoutDataDone.resolve();
    } else {
      readable2.push(value);
    }
  } catch {
  }
};
var onStdoutFinished = async ({ subprocessStdout, onStdoutDataDone, readable: readable2, subprocess, subprocessStdin }) => {
  try {
    await waitForSubprocessStdout(subprocessStdout);
    await subprocess;
    await safeWaitForSubprocessStdin(subprocessStdin);
    await onStdoutDataDone;
    if (readable2.readable) {
      readable2.push(null);
    }
  } catch (error) {
    await safeWaitForSubprocessStdin(subprocessStdin);
    destroyOtherReadable(readable2, await getPrematureCloseError(subprocess, error));
  }
};
var getPrematureCloseError = async (subprocess, error) => {
  if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") {
    return error;
  }
  try {
    await subprocess;
  } catch (subprocessError) {
    return subprocessError;
  }
  return error;
};
var onReadableDestroy = async ({ subprocessStdout, subprocess, waitReadableDestroy }, error) => {
  if (!await waitForConcurrentStreams(waitReadableDestroy, subprocess)) {
    return;
  }
  destroyOtherReadable(subprocessStdout, error);
  await waitForSubprocess(subprocess, error);
};
var destroyOtherReadable = (stream, error) => {
  destroyOtherStream(stream, stream.readable, error);
};

// node_modules/execa/lib/convert/web.js
import { Readable as Readable4, Writable as Writable3, Duplex as Duplex3 } from "node:stream";
var createReadableStream = (subprocess, readableOptions) => Readable4.toWeb(subprocess.readable(readableOptions));
var createWritableStream = (subprocess, writableOptions) => Writable3.toWeb(subprocess.writable(writableOptions));
var createTransformStream = (subprocess, duplexOptions) => Duplex3.toWeb(subprocess.duplex(duplexOptions));

// node_modules/execa/lib/pipe/pipe-arguments.js
var normalizePipeArguments = ({ source, sourcePromise, boundOptions, createNested }, ...pipeArguments) => {
  const startTime = getStartTime();
  const {
    destination,
    destinationStream,
    destinationError,
    from,
    unpipeSignal
  } = getDestinationStream(boundOptions, createNested, pipeArguments);
  const { sourceStream, sourceError } = getSourceStream(source, from);
  const { options: sourceOptions, fileDescriptors } = SUBPROCESS_OPTIONS.get(source);
  return {
    sourcePromise,
    sourceStream,
    sourceOptions,
    sourceError,
    destination,
    destinationStream,
    destinationError,
    unpipeSignal,
    fileDescriptors,
    startTime
  };
};
var getDestinationStream = (boundOptions, createNested, pipeArguments) => {
  try {
    const {
      destination,
      pipeOptions: { from, to, unpipeSignal } = {}
    } = getDestination(boundOptions, createNested, ...pipeArguments);
    const destinationStream = getToStream(destination, to);
    return {
      destination,
      destinationStream,
      from,
      unpipeSignal
    };
  } catch (error) {
    return { destinationError: error };
  }
};
var getDestination = (boundOptions, createNested, firstArgument, ...pipeArguments) => {
  if (Array.isArray(firstArgument)) {
    const destination = createNested(mapDestinationArguments, boundOptions)(firstArgument, ...pipeArguments);
    return { destination, pipeOptions: boundOptions };
  }
  if (typeof firstArgument === "string" || firstArgument instanceof URL || isDenoExecPath(firstArgument)) {
    if (Object.keys(boundOptions).length > 0) {
      throw new TypeError('Please use .pipe("file", ..., options) or .pipe(execa("file", ..., options)) instead of .pipe(options)("file", ...).');
    }
    const [rawFile, rawArguments, rawOptions] = normalizeParameters(firstArgument, ...pipeArguments);
    const destination = createNested(mapDestinationArguments)(rawFile, rawArguments, rawOptions);
    return { destination, pipeOptions: rawOptions };
  }
  if (SUBPROCESS_OPTIONS.has(firstArgument)) {
    if (Object.keys(boundOptions).length > 0) {
      throw new TypeError("Please use .pipe(options)`command` or .pipe($(options)`command`) instead of .pipe(options)($`command`).");
    }
    return { destination: firstArgument, pipeOptions: pipeArguments[0] };
  }
  throw new TypeError(`The first argument must be a template string, an options object, or an Execa subprocess: ${firstArgument}`);
};
var mapDestinationArguments = ({ options }) => ({ options: { ...options, stdin: "pipe", piped: true } });
var getSourceStream = (source, from) => {
  try {
    const sourceStream = getFromStream(source, from);
    return { sourceStream };
  } catch (error) {
    return { sourceError: error };
  }
};

// node_modules/execa/lib/pipe/throw.js
var handlePipeArgumentsError = ({
  sourceStream,
  sourceError,
  destinationStream,
  destinationError,
  fileDescriptors,
  sourceOptions,
  startTime
}) => {
  const error = getPipeArgumentsError({
    sourceStream,
    sourceError,
    destinationStream,
    destinationError
  });
  if (error !== void 0) {
    throw createNonCommandError({
      error,
      fileDescriptors,
      sourceOptions,
      startTime
    });
  }
};
var getPipeArgumentsError = ({ sourceStream, sourceError, destinationStream, destinationError }) => {
  if (sourceError !== void 0 && destinationError !== void 0) {
    return destinationError;
  }
  if (destinationError !== void 0) {
    abortSourceStream(sourceStream);
    return destinationError;
  }
  if (sourceError !== void 0) {
    endDestinationStream(destinationStream);
    return sourceError;
  }
};
var createNonCommandError = ({ error, fileDescriptors, sourceOptions, startTime }) => makeEarlyError({
  error,
  command: PIPE_COMMAND_MESSAGE,
  escapedCommand: PIPE_COMMAND_MESSAGE,
  fileDescriptors,
  options: sourceOptions,
  startTime,
  isSync: false
});
var PIPE_COMMAND_MESSAGE = "source.pipe(destination)";

// node_modules/execa/lib/pipe/sequence.js
var waitForBothSubprocesses = async (subprocessPromises) => {
  const [
    { status: sourceStatus, reason: sourceReason, value: sourceResult = sourceReason },
    { status: destinationStatus, reason: destinationReason, value: destinationResult = destinationReason }
  ] = await subprocessPromises;
  if (!destinationResult.pipedFrom.includes(sourceResult)) {
    destinationResult.pipedFrom.push(sourceResult);
  }
  if (destinationStatus === "rejected") {
    throw destinationResult;
  }
  if (sourceStatus === "rejected") {
    throw sourceResult;
  }
  return destinationResult;
};

// node_modules/execa/lib/pipe/streaming.js
import { finished as finished6 } from "node:stream/promises";
var pipeSubprocessStream = (sourceStream, destinationStream, maxListenersController) => {
  const mergedStream = MERGED_STREAMS.has(destinationStream) ? pipeMoreSubprocessStream(sourceStream, destinationStream) : pipeFirstSubprocessStream(sourceStream, destinationStream);
  incrementMaxListeners(sourceStream, SOURCE_LISTENERS_PER_PIPE, maxListenersController.signal);
  incrementMaxListeners(destinationStream, DESTINATION_LISTENERS_PER_PIPE, maxListenersController.signal);
  cleanupMergedStreamsMap(destinationStream);
  return mergedStream;
};
var pipeFirstSubprocessStream = (sourceStream, destinationStream) => {
  const mergedStream = mergeStreams([sourceStream]);
  pipeStreams(mergedStream, destinationStream);
  MERGED_STREAMS.set(destinationStream, mergedStream);
  return mergedStream;
};
var pipeMoreSubprocessStream = (sourceStream, destinationStream) => {
  const mergedStream = MERGED_STREAMS.get(destinationStream);
  mergedStream.add(sourceStream);
  return mergedStream;
};
var cleanupMergedStreamsMap = async (destinationStream) => {
  try {
    await finished6(destinationStream, { cleanup: true, readable: false, writable: true });
  } catch {
  }
  MERGED_STREAMS.delete(destinationStream);
};
var MERGED_STREAMS = /* @__PURE__ */ new WeakMap();
var SOURCE_LISTENERS_PER_PIPE = 2;
var DESTINATION_LISTENERS_PER_PIPE = 1;

// node_modules/execa/lib/pipe/abort.js
import { aborted } from "node:util";
var unpipeOnAbort = (unpipeSignal, unpipeContext) => unpipeSignal === void 0 ? [] : [unpipeOnSignalAbort(unpipeSignal, unpipeContext)];
var unpipeOnSignalAbort = async (unpipeSignal, { sourceStream, mergedStream, fileDescriptors, sourceOptions, startTime }) => {
  await aborted(unpipeSignal, sourceStream);
  await mergedStream.remove(sourceStream);
  const error = new Error("Pipe canceled by `unpipeSignal` option.");
  throw createNonCommandError({
    error,
    fileDescriptors,
    sourceOptions,
    startTime
  });
};

// node_modules/execa/lib/pipe/setup.js
var pipeToSubprocess = (sourceInfo, ...pipeArguments) => {
  if (isPlainObject(pipeArguments[0])) {
    return pipeToSubprocess.bind(void 0, {
      ...sourceInfo,
      boundOptions: { ...sourceInfo.boundOptions, ...pipeArguments[0] }
    });
  }
  const { destination, ...normalizedInfo } = normalizePipeArguments(sourceInfo, ...pipeArguments);
  const pipeFailureController = new AbortController();
  const promise = handlePipePromise({ ...normalizedInfo, destination, pipeFailureController });
  promise.pipe = pipeToSubprocess.bind(void 0, {
    ...sourceInfo,
    source: destination,
    sourcePromise: promise,
    boundOptions: {}
  });
  forwardDestinationMethods(promise, destination, pipeFailureController.signal);
  return promise;
};
var forwardDestinationMethods = (promise, destination, pipeFailureSignal) => {
  if (destination === void 0) {
    return;
  }
  forwardReadableMethods(promise, destination);
  forwardIpcMethods(promise, destination, pipeFailureSignal);
};
var forwardReadableMethods = (promise, destination) => {
  const subprocessOptions = SUBPROCESS_OPTIONS.get(destination);
  SUBPROCESS_OPTIONS.set(promise, subprocessOptions);
  promise.stdio = destination.stdio;
  promise.all = destination.all;
  const { options: { encoding } } = subprocessOptions;
  const concurrentStreams = initializeConcurrentStreams();
  promise[Symbol.asyncIterator] = createIterable.bind(void 0, promise, encoding, {});
  promise.iterable = createIterable.bind(void 0, promise, encoding);
  promise.readable = createPipeReadable.bind(void 0, promise, {
    subprocess: promise,
    concurrentStreams,
    encoding
  });
  promise.readableStream = createReadableStream.bind(void 0, promise);
  forwardAll(promise, destination);
};
var forwardAll = (promise, destination) => {
  if (destination.all === void 0) {
    promise.all = void 0;
    return;
  }
  Object.defineProperty(promise, "all", {
    get() {
      setAllProperty(promise, destination.all);
      const all = promise.readable({ from: "all" });
      setAllProperty(promise, all);
      return all;
    },
    enumerable: true,
    configurable: true
  });
};
var setAllProperty = (promise, value) => {
  Object.defineProperty(promise, "all", {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
};
var createPipeReadable = (promise, readableOptions, ...arguments_) => {
  const readable2 = createReadable(readableOptions, ...arguments_);
  destroyOnPipeFailure(promise, readable2);
  return readable2;
};
var destroyOnPipeFailure = async (promise, readable2) => {
  try {
    await promise;
  } catch (error) {
    readable2.destroy(error);
  }
};
var forwardIpcMethods = (promise, destination, pipeFailureSignal) => {
  promise.sendMessage = destination.sendMessage;
  promise.getOneMessage = getOnePipeMessage.bind(void 0, destination, pipeFailureSignal);
  promise.getEachMessage = getEachPipeMessage.bind(void 0, promise, destination, pipeFailureSignal);
};
var getOnePipeMessage = (destination, pipeFailureSignal, ...arguments_) => {
  const controller = new AbortController();
  const messagePromise = destination.getOneMessage(...addPipeOptions(arguments_, controller.signal, internalGetOneMessageOptions));
  return waitForOnePipeMessage(pipeFailureSignal, messagePromise, controller);
};
var waitForOnePipeMessage = async (pipeFailureSignal, messagePromise, controller) => {
  try {
    return await Promise.race([messagePromise, getSignalRejection(pipeFailureSignal, controller.signal)]);
  } finally {
    controller.abort();
  }
};
var getSignalRejection = (signal, listenerSignal) => new Promise((_, reject) => {
  if (signal.aborted) {
    reject(signal.reason);
    return;
  }
  signal.addEventListener("abort", () => {
    reject(signal.reason);
  }, { once: true, signal: listenerSignal });
});
var getEachPipeMessage = (promise, destination, pipeFailureSignal, ...arguments_) => {
  const controller = new AbortController();
  const iterator = destination.getEachMessage(...addPipeOptions(arguments_, controller.signal, internalGetEachMessageOptions));
  abortOnSignal(pipeFailureSignal, controller);
  return iterateOnPipeMessages(promise, iterator, controller);
};
var iterateOnPipeMessages = async function* (promise, iterator, controller) {
  try {
    yield* iterator;
  } finally {
    controller.abort();
    await promise;
  }
};
var addPipeOptions = (arguments_, signal, internalOptionsSymbol) => {
  if (arguments_[0] === null) {
    return arguments_;
  }
  const [options] = arguments_;
  return [{ ...options, [internalOptionsSymbol]: { signal, shouldAwait: false } }];
};
var abortOnSignal = (signal, controller) => {
  if (signal.aborted) {
    controller.abort();
    return;
  }
  signal.addEventListener("abort", () => {
    controller.abort();
  }, { once: true, signal: controller.signal });
};
var handlePipePromise = async ({
  sourcePromise,
  sourceStream,
  sourceOptions,
  sourceError,
  destination,
  destinationStream,
  destinationError,
  unpipeSignal,
  fileDescriptors,
  startTime,
  pipeFailureController
}) => {
  const maxListenersController = new AbortController();
  try {
    const subprocessPromises = getSubprocessPromises(sourcePromise, destination);
    handlePipeArgumentsError({
      sourceStream,
      sourceError,
      destinationStream,
      destinationError,
      fileDescriptors,
      sourceOptions,
      startTime
    });
    const mergedStream = pipeSubprocessStream(sourceStream, destinationStream, maxListenersController);
    return await Promise.race([
      waitForBothSubprocesses(subprocessPromises),
      ...unpipeOnAbort(unpipeSignal, {
        sourceStream,
        mergedStream,
        sourceOptions,
        fileDescriptors,
        startTime
      })
    ]);
  } catch (error) {
    pipeFailureController.abort(error);
    throw error;
  } finally {
    maxListenersController.abort();
  }
};
var getSubprocessPromises = (sourcePromise, destination) => Promise.allSettled([sourcePromise, destination]);

// node_modules/execa/lib/io/contents.js
import { setImmediate } from "node:timers/promises";
var getStreamOutput = async ({ stream, onStreamEnd, fdNumber, encoding, buffer, maxBuffer, lines, allMixed, stripFinalNewline: stripFinalNewline2, verboseInfo, streamInfo }) => {
  const logPromise = logOutputAsync({
    stream,
    onStreamEnd,
    fdNumber,
    encoding,
    allMixed,
    verboseInfo,
    streamInfo
  });
  if (!buffer) {
    await Promise.all([resumeStream(stream), logPromise]);
    return;
  }
  const stripFinalNewlineValue = getStripFinalNewline(stripFinalNewline2, fdNumber);
  const iterable2 = iterateForResult({
    stream,
    onStreamEnd,
    lines,
    encoding,
    stripFinalNewline: stripFinalNewlineValue,
    allMixed
  });
  const [output] = await Promise.all([
    getStreamContents2({
      stream,
      iterable: iterable2,
      fdNumber,
      encoding,
      maxBuffer,
      lines
    }),
    logPromise
  ]);
  return output;
};
var logOutputAsync = async ({ stream, onStreamEnd, fdNumber, encoding, allMixed, verboseInfo, streamInfo: { fileDescriptors } }) => {
  if (!shouldLogOutput({
    stdioItems: fileDescriptors[fdNumber]?.stdioItems,
    encoding,
    verboseInfo,
    fdNumber
  })) {
    return;
  }
  const linesIterable = iterateForResult({
    stream,
    onStreamEnd,
    lines: true,
    encoding,
    stripFinalNewline: true,
    allMixed
  });
  await logLines(linesIterable, stream, fdNumber, verboseInfo);
};
var resumeStream = async (stream) => {
  await setImmediate();
  if (stream.readableFlowing === null) {
    stream.resume();
  }
};
var getStreamContents2 = async ({ stream, stream: { readableObjectMode }, iterable: iterable2, fdNumber, encoding, maxBuffer, lines }) => {
  try {
    if (readableObjectMode || lines) {
      return await getStreamAsArray(iterable2, { maxBuffer });
    }
    if (encoding === "buffer") {
      return new Uint8Array(await getStreamAsArrayBuffer(iterable2, { maxBuffer }));
    }
    return await getStreamAsString(iterable2, { maxBuffer });
  } catch (error) {
    return handleBufferedData(handleMaxBuffer({
      error,
      stream,
      readableObjectMode,
      lines,
      encoding,
      fdNumber
    }));
  }
};
var getBufferedData = async (streamPromise) => {
  try {
    return await streamPromise;
  } catch (error) {
    return handleBufferedData(error);
  }
};
var handleBufferedData = ({ bufferedData }) => isArrayBuffer(bufferedData) ? new Uint8Array(bufferedData) : bufferedData;

// node_modules/execa/lib/resolve/stdio.js
var waitForStdioStreams = ({ subprocess, encoding, buffer, maxBuffer, lines, stripFinalNewline: stripFinalNewline2, verboseInfo, streamInfo }) => subprocess.stdio.map((stream, fdNumber) => waitForSubprocessStream({
  stream,
  fdNumber,
  encoding,
  buffer: buffer[fdNumber],
  maxBuffer: maxBuffer[fdNumber],
  lines: lines[fdNumber],
  allMixed: false,
  stripFinalNewline: stripFinalNewline2,
  verboseInfo,
  streamInfo
}));
var waitForSubprocessStream = async ({ stream, fdNumber, encoding, buffer, maxBuffer, lines, allMixed, stripFinalNewline: stripFinalNewline2, verboseInfo, streamInfo }) => {
  if (!stream) {
    return;
  }
  const onStreamEnd = waitForStream(stream, fdNumber, streamInfo);
  if (isInputFileDescriptor(streamInfo, fdNumber)) {
    await onStreamEnd;
    return;
  }
  const [output] = await Promise.all([
    getStreamOutput({
      stream,
      onStreamEnd,
      fdNumber,
      encoding,
      buffer,
      maxBuffer,
      lines,
      allMixed,
      stripFinalNewline: stripFinalNewline2,
      verboseInfo,
      streamInfo
    }),
    onStreamEnd
  ]);
  return output;
};

// node_modules/execa/lib/resolve/all-async.js
var makeAllStream = ({ stdout, stderr }, { all }) => all && (stdout || stderr) ? mergeStreams([stdout, stderr].filter(Boolean)) : void 0;
var waitForAllStream = ({ subprocess, all, encoding, buffer, maxBuffer, lines, stripFinalNewline: stripFinalNewline2, verboseInfo, streamInfo }) => waitForSubprocessStream({
  ...getAllStream(subprocess, all, buffer),
  fdNumber: "all",
  encoding,
  maxBuffer: maxBuffer[1] + maxBuffer[2],
  lines: lines[1] || lines[2],
  allMixed: getAllMixed(subprocess, all),
  stripFinalNewline: stripFinalNewline2,
  verboseInfo,
  streamInfo
});
var getAllStream = ({ stdout, stderr }, all, [, bufferStdout, bufferStderr]) => {
  const buffer = bufferStdout || bufferStderr;
  if (!buffer) {
    return { stream: all, buffer };
  }
  if (!bufferStdout) {
    return { stream: stderr, buffer };
  }
  if (!bufferStderr) {
    return { stream: stdout, buffer };
  }
  return { stream: all, buffer };
};
var getAllMixed = ({ stdout, stderr }, all) => all && stdout && stderr && stdout.readableObjectMode !== stderr.readableObjectMode;

// node_modules/execa/lib/resolve/wait-subprocess.js
import { once as once8 } from "node:events";

// node_modules/execa/lib/verbose/ipc.js
var shouldLogIpc = (verboseInfo) => isFullVerbose(verboseInfo, "ipc");
var logIpcOutput = (message, verboseInfo) => {
  const verboseMessage = serializeVerboseMessage(message);
  verboseLog({
    type: "ipc",
    verboseMessage,
    fdNumber: "ipc",
    verboseInfo
  });
};

// node_modules/execa/lib/ipc/buffer-messages.js
var waitForIpcOutput = async ({
  subprocess,
  buffer: bufferArray,
  maxBuffer: maxBufferArray,
  ipc,
  ipcOutput,
  verboseInfo
}) => {
  if (!ipc) {
    return ipcOutput;
  }
  const isVerbose2 = shouldLogIpc(verboseInfo);
  const buffer = getFdSpecificValue(bufferArray, "ipc");
  const maxBuffer = getFdSpecificValue(maxBufferArray, "ipc");
  for await (const message of loopOnMessages({
    anyProcess: subprocess,
    channel: subprocess.channel,
    isSubprocess: false,
    ipc,
    shouldAwait: false,
    reference: true
  })) {
    if (buffer) {
      checkIpcMaxBuffer(subprocess, ipcOutput, maxBuffer);
      ipcOutput.push(message);
    }
    if (isVerbose2) {
      logIpcOutput(message, verboseInfo);
    }
  }
  return ipcOutput;
};
var getBufferedIpcOutput = async (ipcOutputPromise, ipcOutput) => {
  await Promise.allSettled([ipcOutputPromise]);
  return ipcOutput;
};

// node_modules/execa/lib/resolve/wait-subprocess.js
var waitForSubprocessResult = async ({
  subprocess,
  kill,
  all,
  options: {
    encoding,
    buffer,
    maxBuffer,
    lines,
    timeoutDuration: timeout,
    cancelSignal,
    gracefulCancel,
    forceKillAfterDelay,
    stripFinalNewline: stripFinalNewline2,
    ipc,
    ipcInput
  },
  context,
  verboseInfo,
  fileDescriptors,
  originalStreams,
  onInternalError,
  controller
}) => {
  const exitPromise = waitForExit(subprocess, context);
  const streamInfo = {
    originalStreams,
    fileDescriptors,
    subprocess,
    exitPromise,
    propagating: false
  };
  const stdioPromises = waitForStdioStreams({
    subprocess,
    encoding,
    buffer,
    maxBuffer,
    lines,
    stripFinalNewline: stripFinalNewline2,
    verboseInfo,
    streamInfo
  });
  const allPromise = waitForAllStream({
    subprocess,
    all,
    encoding,
    buffer,
    maxBuffer,
    lines,
    stripFinalNewline: stripFinalNewline2,
    verboseInfo,
    streamInfo
  });
  const ipcOutput = [];
  const ipcOutputPromise = waitForIpcOutput({
    subprocess,
    buffer,
    maxBuffer,
    ipc,
    ipcOutput,
    verboseInfo
  });
  const originalPromises = waitForOriginalStreams(originalStreams, subprocess, streamInfo);
  const customStreamsEndPromises = waitForCustomStreamsEnd(fileDescriptors, streamInfo);
  try {
    return await Promise.race([
      Promise.all([
        {},
        waitForSuccessfulExit(exitPromise),
        Promise.all(stdioPromises),
        allPromise,
        ipcOutputPromise,
        sendIpcInput(subprocess, ipcInput, ipc),
        ...originalPromises,
        ...customStreamsEndPromises
      ]),
      onInternalError,
      throwOnSubprocessError(subprocess, controller),
      ...throwOnTimeout(kill, timeout, context, controller),
      ...throwOnCancel({
        kill,
        cancelSignal,
        gracefulCancel,
        context,
        controller
      }),
      ...throwOnGracefulCancel({
        subprocess,
        kill,
        cancelSignal,
        gracefulCancel,
        forceKillAfterDelay,
        context,
        controller
      })
    ]);
  } catch (error) {
    context.terminationReason ??= "other";
    return Promise.all([
      { error },
      exitPromise,
      Promise.all(stdioPromises.map((stdioPromise) => getBufferedData(stdioPromise))),
      getBufferedData(allPromise),
      getBufferedIpcOutput(ipcOutputPromise, ipcOutput),
      Promise.allSettled(originalPromises),
      Promise.allSettled(customStreamsEndPromises)
    ]);
  }
};
var waitForOriginalStreams = (originalStreams, subprocess, streamInfo) => originalStreams.map((stream, fdNumber) => stream === subprocess.stdio[fdNumber] ? void 0 : waitForStream(stream, fdNumber, streamInfo));
var waitForCustomStreamsEnd = (fileDescriptors, streamInfo) => fileDescriptors.flatMap(({ stdioItems }, fdNumber) => stdioItems.filter(({ value, stream = value }) => isStream(stream, { checkOpen: false }) && !isStandardStream(stream)).map(({ type, value, stream = value }) => waitForStream(stream, fdNumber, streamInfo, {
  isSameDirection: TRANSFORM_TYPES.has(type),
  stopOnExit: type === "native"
})));
var throwOnSubprocessError = async (subprocess, { signal }) => {
  const [error] = await once8(subprocess, "error", { signal });
  throw error;
};

// node_modules/execa/lib/convert/writable.js
import { Writable as Writable4 } from "node:stream";
import { callbackify as callbackify3 } from "node:util";
var createWritable = ({ subprocess, concurrentStreams }, { to } = {}) => {
  const { subprocessStdin, waitWritableFinal, waitWritableDestroy } = getSubprocessStdin(subprocess, to, concurrentStreams);
  const writable2 = new Writable4({
    ...getWritableMethods(subprocessStdin, subprocess, waitWritableFinal),
    destroy: callbackify3(onWritableDestroy.bind(void 0, {
      subprocessStdin,
      subprocess,
      waitWritableFinal,
      waitWritableDestroy
    })),
    highWaterMark: subprocessStdin.writableHighWaterMark,
    objectMode: subprocessStdin.writableObjectMode
  });
  onStdinFinished(subprocessStdin, writable2, void 0, subprocess);
  return writable2;
};
var getSubprocessStdin = (subprocess, to, concurrentStreams) => {
  const subprocessStdin = getToStream(subprocess, to);
  const waitWritableFinal = addConcurrentStream(concurrentStreams, subprocessStdin, "writableFinal");
  const waitWritableDestroy = addConcurrentStream(concurrentStreams, subprocessStdin, "writableDestroy");
  return { subprocessStdin, waitWritableFinal, waitWritableDestroy };
};
var getWritableMethods = (subprocessStdin, subprocess, waitWritableFinal) => ({
  write: onWrite.bind(void 0, subprocessStdin),
  final: callbackify3(onWritableFinal.bind(void 0, subprocessStdin, subprocess, waitWritableFinal))
});
var onWrite = (subprocessStdin, chunk, encoding, done) => {
  if (subprocessStdin.write(chunk, encoding)) {
    done();
  } else {
    subprocessStdin.once("drain", done);
  }
};
var onWritableFinal = async (subprocessStdin, subprocess, waitWritableFinal) => {
  if (!await waitForConcurrentStreams(waitWritableFinal, subprocess)) {
    return;
  }
  if (subprocessStdin.writable) {
    subprocessStdin.end();
  }
  await subprocess;
};
var onStdinFinished = async (subprocessStdin, writable2, subprocessStdout, subprocess) => {
  try {
    await waitForSubprocessStdin(subprocessStdin);
    await subprocess;
    if (writable2.writable) {
      writable2.end();
    }
  } catch (error) {
    await safeWaitForSubprocessStdout(subprocessStdout);
    destroyOtherWritable(writable2, await getSubprocessError(subprocess, error));
  }
};
var getSubprocessError = async (subprocess, error) => {
  if (!shouldUseSubprocessError(error)) {
    return error;
  }
  try {
    await subprocess;
  } catch (subprocessError) {
    return subprocessError;
  }
  return error;
};
var shouldUseSubprocessError = (error) => error === void 0 || isStreamAbort(error);
var onWritableDestroy = async ({ subprocessStdin, subprocess, waitWritableFinal, waitWritableDestroy }, error) => {
  await waitForConcurrentStreams(waitWritableFinal, subprocess);
  if (await waitForConcurrentStreams(waitWritableDestroy, subprocess)) {
    destroyOtherWritable(subprocessStdin, error);
    await waitForSubprocess(subprocess, error);
  }
};
var destroyOtherWritable = (stream, error) => {
  destroyOtherStream(stream, stream.writable, error);
};

// node_modules/execa/lib/convert/duplex.js
import { Duplex as Duplex4 } from "node:stream";
import { callbackify as callbackify4 } from "node:util";
var createDuplex = ({ subprocess, concurrentStreams, encoding }, { from, to, binary: binaryOption = true, preserveNewlines = true } = {}) => {
  const binary = binaryOption || BINARY_ENCODINGS.has(encoding);
  const { subprocessStdout, waitReadableDestroy } = getSubprocessStdout(subprocess, from, concurrentStreams);
  const { subprocessStdin, waitWritableFinal, waitWritableDestroy } = getSubprocessStdin(subprocess, to, concurrentStreams);
  const { readableEncoding, readableObjectMode, readableHighWaterMark } = getReadableOptions(subprocessStdout, binary);
  const { read, onStdoutDataDone } = getReadableMethods({
    subprocessStdout,
    subprocess,
    binary,
    encoding,
    preserveNewlines
  });
  const duplex2 = new Duplex4({
    read,
    ...getWritableMethods(subprocessStdin, subprocess, waitWritableFinal),
    destroy: callbackify4(onDuplexDestroy.bind(void 0, {
      subprocessStdout,
      subprocessStdin,
      subprocess,
      waitReadableDestroy,
      waitWritableFinal,
      waitWritableDestroy
    })),
    readableHighWaterMark,
    writableHighWaterMark: subprocessStdin.writableHighWaterMark,
    readableObjectMode,
    writableObjectMode: subprocessStdin.writableObjectMode,
    encoding: readableEncoding
  });
  onStdoutFinished({
    subprocessStdout,
    onStdoutDataDone,
    readable: duplex2,
    subprocess,
    subprocessStdin
  });
  onStdinFinished(subprocessStdin, duplex2, subprocessStdout, subprocess);
  return duplex2;
};
var onDuplexDestroy = async ({ subprocessStdout, subprocessStdin, subprocess, waitReadableDestroy, waitWritableFinal, waitWritableDestroy }, error) => {
  await Promise.all([
    onReadableDestroy({ subprocessStdout, subprocess, waitReadableDestroy }, error),
    onWritableDestroy({
      subprocessStdin,
      subprocess,
      waitWritableFinal,
      waitWritableDestroy
    }, error)
  ]);
};

// node_modules/execa/lib/convert/add.js
var addConvertedStreams = (subprocess, { encoding }) => {
  const concurrentStreams = initializeConcurrentStreams();
  subprocess.readable = createReadable.bind(void 0, { subprocess, concurrentStreams, encoding });
  subprocess.writable = createWritable.bind(void 0, { subprocess, concurrentStreams });
  subprocess.duplex = createDuplex.bind(void 0, { subprocess, concurrentStreams, encoding });
  subprocess.readableStream = createReadableStream.bind(void 0, subprocess);
  subprocess.writableStream = createWritableStream.bind(void 0, subprocess);
  subprocess.transformStream = createTransformStream.bind(void 0, subprocess);
  subprocess.iterable = createIterable.bind(void 0, subprocess, encoding);
  subprocess[Symbol.asyncIterator] = createIterable.bind(void 0, subprocess, encoding, {});
};

// node_modules/execa/lib/methods/promise.js
var mergePromise = (promise, properties) => Object.assign(promise, properties);

// node_modules/execa/lib/methods/main-async.js
var execaCoreAsync = (rawFile, rawArguments, rawOptions, createNested) => {
  const { file, commandArguments, command, escapedCommand, startTime, verboseInfo, options, fileDescriptors } = handleAsyncArguments(rawFile, rawArguments, rawOptions);
  const { subprocess: nodeChildProcess, promise, kill, all, convertedStreams } = spawnSubprocessAsync({
    file,
    commandArguments,
    options,
    startTime,
    verboseInfo,
    command,
    escapedCommand,
    fileDescriptors
  });
  const subprocess = getSubprocessPromise({
    promise,
    nodeChildProcess,
    kill,
    all,
    convertedStreams,
    options
  });
  subprocess.pipe = pipeToSubprocess.bind(void 0, {
    source: subprocess,
    sourcePromise: promise,
    boundOptions: {},
    createNested
  });
  SUBPROCESS_OPTIONS.set(subprocess, { options, fileDescriptors });
  return subprocess;
};
var handleAsyncArguments = (rawFile, rawArguments, rawOptions) => {
  const { command, escapedCommand, startTime, verboseInfo } = handleCommand(rawFile, rawArguments, rawOptions);
  const { file, commandArguments, options: normalizedOptions } = normalizeOptions(rawFile, rawArguments, rawOptions);
  const options = handleAsyncOptions(normalizedOptions);
  const fileDescriptors = handleStdioAsync(options, verboseInfo);
  return {
    file,
    commandArguments,
    command,
    escapedCommand,
    startTime,
    verboseInfo,
    options,
    fileDescriptors
  };
};
var handleAsyncOptions = ({ timeout, signal, ...options }) => {
  if (signal !== void 0) {
    throw new TypeError('The "signal" option has been renamed to "cancelSignal" instead.');
  }
  return { ...options, timeoutDuration: timeout };
};
var spawnSubprocessAsync = ({ file, commandArguments, options, startTime, verboseInfo, command, escapedCommand, fileDescriptors }) => {
  let subprocess;
  try {
    subprocess = spawn(...concatenateShell(file, commandArguments, getSpawnOptions(options)));
  } catch (error) {
    return handleEarlyError({
      error,
      command,
      escapedCommand,
      fileDescriptors,
      options,
      startTime,
      verboseInfo
    });
  }
  const controller = new AbortController();
  setMaxListeners(Infinity, controller.signal);
  const originalStreams = [...subprocess.stdio];
  pipeOutputAsync(subprocess, fileDescriptors, controller);
  setIpcSubprocessOptions(subprocess, options);
  const context = {};
  const onInternalError = createDeferred();
  const kill = subprocessKill.bind(void 0, {
    kill: getKillFunction(subprocess, options),
    options,
    onInternalError,
    context,
    controller
  });
  cleanupOnExit(kill, options, controller);
  const all = makeAllStream(subprocess, options);
  const promise = handlePromise({
    subprocess,
    kill,
    all,
    options,
    startTime,
    verboseInfo,
    fileDescriptors,
    originalStreams,
    command,
    escapedCommand,
    context,
    onInternalError,
    controller
  });
  return {
    subprocess,
    promise,
    kill,
    all
  };
};
var getSubprocessPromise = ({ promise, nodeChildProcess, kill, all, convertedStreams, options }) => {
  const subprocess = mergePromise(promise, getSubprocessProperties(nodeChildProcess, all));
  subprocess.kill = kill ?? subprocess.kill;
  if (convertedStreams === void 0) {
    addConvertedStreams(subprocess, options);
  } else {
    Object.assign(subprocess, convertedStreams);
  }
  addIpcMethods(subprocess, nodeChildProcess, options);
  return subprocess;
};
var getSubprocessProperties = (nodeChildProcess, all) => ({
  nodeChildProcess,
  pid: nodeChildProcess.pid,
  stdin: nodeChildProcess.stdin,
  stdout: nodeChildProcess.stdout,
  stderr: nodeChildProcess.stderr,
  stdio: nodeChildProcess.stdio,
  all,
  kill: nodeChildProcess.kill.bind(nodeChildProcess)
});
var handlePromise = async ({ subprocess, kill, all: allStream, options, startTime, verboseInfo, fileDescriptors, originalStreams, command, escapedCommand, context, onInternalError, controller }) => {
  const [
    errorInfo,
    [exitCode, signal],
    stdioResults,
    allResult,
    ipcOutput
  ] = await waitForSubprocessResult({
    subprocess,
    kill,
    all: allStream,
    options,
    context,
    verboseInfo,
    fileDescriptors,
    originalStreams,
    onInternalError,
    controller
  });
  controller.abort();
  onInternalError.resolve();
  const stdio = stdioResults.map((stdioResult, fdNumber) => stripNewline(stdioResult, options, fdNumber));
  const all = stripNewline(allResult, options, "all");
  const result = getAsyncResult({
    errorInfo,
    exitCode,
    signal,
    stdio,
    all,
    ipcOutput,
    context,
    options,
    command,
    escapedCommand,
    startTime
  });
  return handleResult(result, verboseInfo, options);
};
var getAsyncResult = ({ errorInfo, exitCode, signal, stdio, all, ipcOutput, context, options, command, escapedCommand, startTime }) => "error" in errorInfo ? makeError({
  error: errorInfo.error,
  command,
  escapedCommand,
  timedOut: context.terminationReason === "timeout",
  isCanceled: context.terminationReason === "cancel" || context.terminationReason === "gracefulCancel",
  isGracefullyCanceled: context.terminationReason === "gracefulCancel",
  isMaxBuffer: errorInfo.error instanceof MaxBufferError,
  isForcefullyTerminated: context.isForcefullyTerminated,
  exitCode,
  signal,
  stdio,
  all,
  ipcOutput,
  options,
  startTime,
  isSync: false
}) : makeSuccessResult({
  command,
  escapedCommand,
  stdio,
  all,
  ipcOutput,
  options,
  startTime
});

// node_modules/execa/lib/methods/bind.js
var mergeOptions = (boundOptions, options) => {
  const safeBoundOptions = { __proto__: null, ...boundOptions };
  const mergedOptions = Object.fromEntries(Object.entries(options).map(([optionName, optionValue]) => [
    optionName,
    mergeOption(optionName, safeBoundOptions[optionName], optionValue)
  ]));
  return { ...safeBoundOptions, ...mergedOptions };
};
var mergeOption = (optionName, boundOptionValue, optionValue) => {
  if (DEEP_OPTIONS.has(optionName) && isPlainObject(boundOptionValue) && isPlainObject(optionValue)) {
    return { ...boundOptionValue, ...optionValue };
  }
  return optionValue;
};
var DEEP_OPTIONS = /* @__PURE__ */ new Set(["env", ...FD_SPECIFIC_OPTIONS]);

// node_modules/execa/lib/methods/create.js
var createExeca = (mapArguments, boundOptions, deepOptions, setBoundExeca) => {
  const createNested = (mapArguments2, boundOptions2, setBoundExeca2) => createExeca(mapArguments2, boundOptions2, deepOptions, setBoundExeca2);
  const boundExeca = (...execaArguments) => callBoundExeca({
    mapArguments,
    deepOptions,
    boundOptions,
    setBoundExeca,
    createNested
  }, ...execaArguments);
  if (setBoundExeca !== void 0) {
    setBoundExeca(boundExeca, createNested, boundOptions);
  }
  return boundExeca;
};
var callBoundExeca = ({ mapArguments, deepOptions = {}, boundOptions = {}, setBoundExeca, createNested }, firstArgument, ...nextArguments) => {
  if (isPlainObject(firstArgument)) {
    return createNested(mapArguments, mergeOptions(boundOptions, firstArgument), setBoundExeca);
  }
  const { file, commandArguments, options, isSync } = parseArguments({
    mapArguments,
    firstArgument,
    nextArguments,
    deepOptions,
    boundOptions
  });
  return isSync ? execaCoreSync(file, commandArguments, options) : execaCoreAsync(file, commandArguments, options, createNested);
};
var parseArguments = ({ mapArguments, firstArgument, nextArguments, deepOptions, boundOptions }) => {
  const callArguments = isTemplateString(firstArgument) ? parseTemplates(firstArgument, nextArguments) : [firstArgument, ...nextArguments];
  const [initialFile, initialArguments, initialOptions] = normalizeParameters(...callArguments);
  const mergedOptions = mergeOptions(mergeOptions(deepOptions, boundOptions), initialOptions);
  const {
    options = mergedOptions,
    isSync = false
  } = mapArguments({ options: mergedOptions });
  return {
    file: initialFile,
    commandArguments: initialArguments,
    options,
    isSync
  };
};

// node_modules/execa/lib/methods/script.js
var setScriptSync = (boundExeca, createNested, boundOptions) => {
  boundExeca.sync = createNested(mapScriptSync, boundOptions);
  boundExeca.s = boundExeca.sync;
};
var mapScriptAsync = ({ options }) => getScriptOptions(options);
var mapScriptSync = ({ options }) => ({ ...getScriptOptions(options), isSync: true });
var getScriptOptions = (options) => ({ options: { ...getScriptStdinOption(options), ...options } });
var getScriptStdinOption = ({ input, inputFile, stdio }) => input === void 0 && inputFile === void 0 && stdio === void 0 ? { stdin: "inherit" } : {};
var deepScriptOptions = { preferLocal: true };

// node_modules/execa/index.js
var execa = createExeca(() => ({}));
var execaSync = createExeca(() => ({ isSync: true }));
var execaNode = createExeca(mapNode);
var $ = createExeca(mapScriptAsync, {}, deepScriptOptions, setScriptSync);
var {
  sendMessage: sendMessage2,
  getOneMessage: getOneMessage2,
  getEachMessage: getEachMessage2,
  getCancelSignal: getCancelSignal2
} = getIpcExport();

// src/ports/process.ts
function resolveEnvironment(policy, base) {
  if (policy.kind === "inherited") {
    const resolved2 = {};
    for (const [name, value] of Object.entries(base)) {
      if (value !== void 0) resolved2[name] = value;
    }
    return { ...resolved2, ...policy.overrides ?? {} };
  }
  const resolved = {};
  for (const name of policy.allow) {
    const value = base[name];
    if (value !== void 0) resolved[name] = value;
  }
  return { ...resolved, ...policy.set ?? {} };
}

// src/ports/node-process-runner.ts
var NodeProcessRunner = class {
  baseEnv;
  constructor(baseEnv = process.env) {
    this.baseEnv = baseEnv;
  }
  async run(request) {
    const [executable, ...args] = request.argv;
    if (executable === void 0) {
      return outcome("spawn-failed", { failure: "empty argument vector" });
    }
    const environment = resolveEnvironment(request.env, this.baseEnv);
    if (process.platform === "win32" && !windowsCommandExists(executable, environment, request.cwd)) {
      return outcome("spawn-failed", { failure: `spawn ${executable} ENOENT` });
    }
    const capture = new CombinedCapture(request.maxOutputBytes);
    const started = performance.now();
    const ownDeadline = process.platform === "win32";
    const output = request.output === "ignore" ? "ignore" : "pipe";
    const options = {
      cwd: request.cwd,
      env: environment,
      extendEnv: false,
      shell: false,
      timeout: ownDeadline ? void 0 : request.timeoutMs,
      forceKillAfterDelay: 2e3,
      killSignal: "SIGKILL",
      cleanup: true,
      encoding: "buffer",
      buffer: false,
      stdin: request.stdin === void 0 ? "ignore" : "pipe",
      stdout: output,
      stderr: output,
      reject: false
    };
    let child;
    try {
      child = execa(executable, args, options);
    } catch (error) {
      return outcome("spawn-failed", { failure: messageOf(error) });
    }
    child.stdout?.on("data", (chunk) => capture.push("stdout", chunk));
    child.stderr?.on("data", (chunk) => capture.push("stderr", chunk));
    if (request.stdin !== void 0) child.stdin?.end(request.stdin);
    let killedByDeadline = false;
    const deadline = ownDeadline && request.timeoutMs > 0 ? setTimeout(() => {
      killedByDeadline = true;
      killProcessTree(child.pid);
    }, request.timeoutMs) : void 0;
    let result;
    try {
      result = await child;
    } finally {
      if (deadline !== void 0) clearTimeout(deadline);
    }
    const durationMs = Math.round(performance.now() - started);
    const decoded = capture.decode();
    const base = { ...decoded, durationMs };
    if (result.timedOut === true || killedByDeadline) return outcome("timed-out", base);
    if (result.failed === true && result.exitCode === void 0 && result.signal === void 0) {
      return outcome("spawn-failed", { ...base, failure: result.shortMessage ?? messageOf(result) });
    }
    return outcome("exited", { ...base, exitCode: result.exitCode ?? null });
  }
};
function killProcessTree(pid) {
  if (pid === void 0) return;
  try {
    const killer = spawn2("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: "ignore",
      windowsHide: true,
      detached: false
    });
    killer.on("error", () => {
    });
    killer.unref();
  } catch {
  }
}
var DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";
function windowsCommandExists(command, environment, cwd) {
  for (const candidate of windowsCandidates(command, environment, cwd)) {
    if (isExistingFile(candidate)) return true;
  }
  return false;
}
function* windowsCandidates(command, environment, cwd) {
  const lookup = (name) => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(environment)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return void 0;
  };
  const extensions = ["", ...(lookup("PATHEXT") || DEFAULT_PATHEXT).split(";").filter(Boolean)];
  const directories = /[\\/:]/.test(command) ? [cwd] : [cwd, ...(lookup("PATH") ?? "").split(";")];
  for (const directory of directories) {
    const unquoted = directory.length > 1 && directory.startsWith('"') && directory.endsWith('"') ? directory.slice(1, -1) : directory;
    if (unquoted === "") continue;
    let base;
    try {
      base = path10.resolve(unquoted, command);
    } catch {
      continue;
    }
    for (const extension of extensions) yield base + extension;
  }
}
function isExistingFile(candidate) {
  try {
    return statSync2(candidate).isFile();
  } catch (error) {
    return error.code === "EACCES";
  }
}
var CombinedCapture = class {
  limit;
  chunks = [];
  retained = 0;
  truncated = false;
  constructor(limit) {
    this.limit = Math.max(0, limit);
  }
  push(stream, chunk) {
    const room = this.limit - this.retained;
    if (chunk.length === 0) return;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push({ stream, bytes: chunk.subarray(0, room) });
      this.retained += room;
      this.truncated = true;
      return;
    }
    this.chunks.push({ stream, bytes: chunk });
    this.retained += chunk.length;
  }
  decode() {
    const join = (stream) => {
      const bytes = Buffer.concat(
        this.chunks.filter((entry) => entry.stream === stream).map((entry) => entry.bytes)
      );
      return decodeCompleteUtf8(bytes);
    };
    return { stdout: join("stdout"), stderr: join("stderr"), truncated: this.truncated };
  }
};
function decodeCompleteUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, completeLength(bytes)));
}
function completeLength(bytes) {
  for (let back = 1; back <= 3 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back];
    if ((byte & 192) === 128) continue;
    const width = byte >= 240 ? 4 : byte >= 224 ? 3 : byte >= 192 ? 2 : 1;
    return width > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function outcome(kind, partial) {
  return {
    kind,
    exitCode: partial.exitCode ?? null,
    stdout: partial.stdout ?? "",
    stderr: partial.stderr ?? "",
    truncated: partial.truncated ?? false,
    durationMs: partial.durationMs ?? 0,
    failure: partial.failure ?? null
  };
}

// src/ports/stdin.ts
async function readBoundedStream(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
var processStandardInput = {
  read: (maxBytes) => readBoundedStream(process.stdin, maxBytes)
};

// src/policy/load.ts
import path12 from "node:path";

// src/policy/validate.ts
var import_yaml = __toESM(require_dist(), 1);
import path11 from "node:path";

// src/contracts/policy.ts
var RuleCheck = external_exports.discriminatedUnion("kind", [
  external_exports.strictObject({
    kind: external_exports.literal("reviewer"),
    explanation: external_exports.string().min(1)
  }),
  external_exports.strictObject({
    kind: external_exports.literal("command"),
    command: external_exports.string().min(1),
    explanation: external_exports.string().min(1)
  }),
  external_exports.strictObject({
    kind: external_exports.literal("none"),
    explanation: external_exports.string().min(1)
  })
]);
var KebabId = external_exports.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "must be kebab-case" });
var PolicyRule = external_exports.strictObject({
  id: KebabId,
  category: RuleCategory,
  instruction: external_exports.string().min(1),
  check: RuleCheck,
  /**
   * Allowed only on a path-specific pack (no `**\/*` in `appliesTo`); enforced in
   * `policy/load.ts` because the check needs the pack's `appliesTo`.
   */
  remindOnEdit: external_exports.boolean().default(false)
});
var PolicyPromptRef = external_exports.strictObject({
  stage: PromptStage,
  file: external_exports.string().min(1)
});
var PolicyCommandDecision = external_exports.strictObject({
  command: external_exports.string().min(1),
  action: CommandAction,
  reason: external_exports.string().min(1).optional()
});
var PolicyPack = external_exports.strictObject({
  schemaVersion: external_exports.literal(1),
  id: KebabId,
  authority: Authority,
  appliesTo: external_exports.array(external_exports.string().min(1)).min(1),
  activities: external_exports.array(Activity).min(1),
  source: external_exports.strictObject({
    location: external_exports.string().min(1),
    externalVersion: external_exports.string().min(1).optional()
  }),
  rules: external_exports.array(PolicyRule).default([]),
  prompts: external_exports.array(PolicyPromptRef).default([]),
  commandPolicy: external_exports.array(PolicyCommandDecision).default([]),
  /** Only a project pack may declare this. */
  replaces: external_exports.string().regex(/^builtin\/[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be "builtin/<pack-id>"' }).optional()
});

// src/policy/validate.ts
async function readPackText(fs2, filePath) {
  try {
    return await fs2.readText(filePath);
  } catch {
    return null;
  }
}
async function validatePack(fs2, source, constraints) {
  const { raw, filePath, reference, origin } = source;
  const diagnostics = [];
  let document;
  try {
    document = (0, import_yaml.parse)(raw);
  } catch (cause) {
    diagnostics.push({
      severity: "error",
      code: "pack-unparsable",
      message: `${reference} is not valid YAML: ${cause instanceof Error ? cause.message : String(cause)}`,
      where: filePath
    });
    return { pack: null, diagnostics };
  }
  const parsed = PolicyPack.safeParse(document);
  if (!parsed.success) {
    for (const detail of describeIssues(parsed.error)) {
      diagnostics.push({ severity: "error", code: "pack-invalid", message: `${reference}: ${detail}`, where: filePath });
    }
    return { pack: null, diagnostics };
  }
  const pack = parsed.data;
  const packDirectory = path11.dirname(filePath);
  const resolvedPrompts = [];
  for (const promptRef of pack.prompts) {
    try {
      const absolutePath = await resolveInsideBoundary(
        fs2,
        packDirectory,
        promptRef.file,
        `prompt "${promptRef.file}" referenced by ${reference}`
      );
      const contents = await fs2.readText(absolutePath);
      resolvedPrompts.push({
        packId: pack.id,
        packReference: reference,
        authority: pack.authority,
        stage: promptRef.stage,
        absolutePath,
        declaredPath: promptRef.file,
        contentHash: contentHash(contents)
      });
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: error instanceof AmbicodeError ? error.code : "prompt-unreadable",
        message: `${reference}: ${error instanceof Error ? error.message : String(error)}`,
        where: filePath
      });
    }
  }
  if (constraints.commands === null) {
    if (pack.commandPolicy.length > 0 || pack.rules.some((rule) => rule.check.kind === "command")) {
      diagnostics.push({
        severity: "notice",
        code: "pack-commands-unchecked",
        message: `${reference} names project commands, but no project was determined for this check, so those references were not verified against a command catalog. Pass --project <id>.`,
        where: filePath
      });
    }
  } else {
    const commands = constraints.commands;
    const owner = constraints.projectId ?? "this project";
    for (const decision of pack.commandPolicy) {
      if (!Object.hasOwn(commands, decision.command)) {
        diagnostics.push({
          severity: "error",
          code: "pack-unknown-command",
          message: `${reference} declares a "${decision.action}" decision for command "${decision.command}", which project "${owner}" does not declare. Add it to the command catalog, as null if it is not configured yet.`,
          where: filePath
        });
      }
    }
    for (const rule of pack.rules) {
      if (rule.check.kind === "command" && !Object.hasOwn(commands, rule.check.command)) {
        diagnostics.push({
          severity: "error",
          code: "pack-unknown-command",
          message: `${reference}: rule "${rule.id}" is verified by command "${rule.check.command}", which project "${owner}" does not declare.`,
          where: filePath
        });
      }
    }
  }
  if (pack.appliesTo.includes("**/*")) {
    for (const rule of pack.rules) {
      if (rule.remindOnEdit) {
        diagnostics.push({
          severity: "error",
          code: "remind-on-edit-broad-pack",
          message: `${reference}: rule "${rule.id}" declares remindOnEdit: true, but this pack applies broadly ("**/*"). A reminder is allowed only for a path-specific pack; narrow "appliesTo" or remove remindOnEdit.`,
          where: filePath
        });
      }
    }
  }
  if (pack.replaces !== void 0 && origin !== "project") {
    diagnostics.push({
      severity: "error",
      code: "pack-replaces-builtin",
      message: `Built-in pack "${reference}" must not declare "replaces".`,
      where: filePath
    });
    return { pack: null, diagnostics };
  }
  return {
    pack: { pack, reference, origin, filePath, contentHash: contentHash(raw), resolvedPrompts },
    diagnostics
  };
}
function validatePackSet(packs) {
  const diagnostics = [];
  const replacedIds = /* @__PURE__ */ new Map();
  for (const pack of packs) {
    if (pack.pack.replaces === void 0) continue;
    if (pack.origin !== "project") {
      diagnostics.push({
        severity: "error",
        code: "pack-replaces-not-project",
        message: `Only a project policy file may declare "replaces"; ${pack.reference} is a built-in.`,
        where: pack.filePath
      });
      continue;
    }
    replacedIds.set(pack.pack.replaces, pack);
  }
  const kept = [];
  const seenIds = /* @__PURE__ */ new Map();
  for (const pack of packs) {
    const replacement = replacedIds.get(pack.reference);
    if (replacement !== void 0 && pack.origin === "builtin") {
      replacement.replacedReference = pack.reference;
      continue;
    }
    const existing = seenIds.get(pack.pack.id);
    if (existing !== void 0) {
      diagnostics.push({
        severity: "error",
        code: "pack-duplicate-id",
        message: `Two enabled packs declare id "${pack.pack.id}" (${existing.reference} and ${pack.reference}). Add "replaces: builtin/${pack.pack.id}" if the project pack is meant to supersede the built-in.`,
        where: pack.filePath
      });
      continue;
    }
    seenIds.set(pack.pack.id, pack);
    kept.push(pack);
  }
  for (const [reference, replacement] of replacedIds) {
    if (replacement.replacedReference === void 0) {
      diagnostics.push({
        severity: "warning",
        code: "pack-replaces-unused",
        message: `${replacement.reference} declares "replaces: ${reference}", but that pack is not enabled for this project.`,
        where: replacement.filePath
      });
    }
  }
  return { packs: kept, diagnostics };
}

// src/policy/load.ts
async function loadPacksForProject(options) {
  const { fs: fs2, project, builtinDirectory, repositoryRoot } = options;
  const diagnostics = [];
  const loaded = [];
  const constraints = { commands: project.commands, projectId: project.id };
  for (const reference of project.packs) {
    const id = reference.slice("builtin/".length);
    const filePath = path12.join(builtinDirectory, `${id}.yaml`);
    const raw = await readPackText(fs2, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: "error",
        code: "pack-missing",
        message: `Built-in pack "${reference}" does not exist in this AMBICODE release.`,
        where: filePath
      });
      continue;
    }
    const validated = await validatePack(fs2, { raw, filePath, reference, origin: "builtin" }, constraints);
    diagnostics.push(...validated.diagnostics);
    if (validated.pack === null) continue;
    if (validated.pack.pack.id !== id) {
      diagnostics.push({
        severity: "error",
        code: "pack-id-mismatch",
        message: `Built-in pack "${reference}" declares id "${validated.pack.pack.id}".`,
        where: filePath
      });
      continue;
    }
    loaded.push(validated.pack);
  }
  for (const relativePath of project.policyFiles) {
    const filePath = path12.join(repositoryRoot, relativePath);
    const raw = await readPackText(fs2, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: "error",
        code: "pack-missing",
        message: `Policy file "${relativePath}" was not found. Project policy paths are relative to the repository root.`,
        where: filePath
      });
      continue;
    }
    const validated = await validatePack(
      fs2,
      { raw, filePath, reference: relativePath, origin: "project" },
      constraints
    );
    diagnostics.push(...validated.diagnostics);
    if (validated.pack !== null) loaded.push(validated.pack);
  }
  const set = validatePackSet(loaded);
  return { packs: set.packs, diagnostics: [...diagnostics, ...set.diagnostics] };
}

// src/contracts/provider.ts
var DeliveryCertainty = external_exports.enum(["before-send", "uncertain"]);
function providerOk(value) {
  return { kind: "ok", value };
}
function providerUnsupported(provider, operation, message) {
  return { kind: "unsupported", provider, operation, message };
}
function providerFailed(provider, operation, message, details = [], certainty = "uncertain") {
  return { kind: "failed", provider, operation, message, details, certainty };
}
var RemoteTarget = external_exports.strictObject({
  provider: ProviderId,
  host: external_exports.string().min(1),
  projectId: external_exports.string().min(1),
  projectPath: external_exports.string().min(1),
  /** Where the post-image blobs live: differs from the target only for a fork merge request. */
  sourceProjectId: external_exports.string().min(1),
  sourceProjectPath: external_exports.string().min(1),
  mergeRequestIid: external_exports.number().int().positive(),
  webUrl: external_exports.string().min(1),
  versionId: external_exports.number().int().positive(),
  baseSha: external_exports.string().min(1),
  startSha: external_exports.string().min(1),
  headSha: external_exports.string().min(1)
});
var RemotePosition = external_exports.strictObject({
  baseSha: external_exports.string().min(1),
  startSha: external_exports.string().min(1),
  headSha: external_exports.string().min(1),
  oldPath: external_exports.string().nullable(),
  newPath: external_exports.string().nullable(),
  oldLine: external_exports.number().int().positive().nullable(),
  newLine: external_exports.number().int().positive().nullable()
});
function samePosition(left, right) {
  return left.baseSha === right.baseSha && left.startSha === right.startSha && left.headSha === right.headSha && left.oldPath === right.oldPath && left.newPath === right.newPath && left.oldLine === right.oldLine && left.newLine === right.newLine;
}
var RemoteNote = external_exports.strictObject({
  id: external_exports.string().min(1),
  discussionId: external_exports.string().min(1),
  author: external_exports.string(),
  body: external_exports.string(),
  url: external_exports.string().nullable().default(null),
  createdAt: external_exports.string().nullable().default(null),
  updatedAt: external_exports.string().nullable().default(null),
  resolved: external_exports.boolean().nullable().default(null),
  resolvable: external_exports.boolean().default(false),
  system: external_exports.boolean().default(false),
  position: RemotePosition.nullable().default(null)
});
var RemoteDiscussion = external_exports.strictObject({
  id: external_exports.string().min(1),
  resolved: external_exports.boolean(),
  notes: external_exports.array(RemoteNote).default([])
});
var RemoteRevisionState = external_exports.enum(["current", "stale", "collecting", "unavailable"]);
var RemoteRevision = external_exports.strictObject({
  state: RemoteRevisionState,
  provider: ProviderId,
  host: external_exports.string().min(1),
  projectId: external_exports.string().min(1),
  mergeRequestIid: external_exports.number().int().positive(),
  headSha: external_exports.string().nullable(),
  versionId: external_exports.number().int().positive().nullable(),
  collectedHeadSha: external_exports.string().nullable(),
  mergeRequestState: external_exports.string().nullable().default(null),
  reason: external_exports.string().nullable().default(null)
});
function revisionMatches(pinned, current) {
  const differences = [];
  if (pinned.provider !== current.provider) {
    differences.push(`provider ${pinned.provider} \u2192 ${current.provider}`);
  }
  if (pinned.host !== current.host) differences.push(`host ${pinned.host} \u2192 ${current.host}`);
  if (pinned.projectId !== current.projectId) {
    differences.push(`project ${pinned.projectId} \u2192 ${current.projectId}`);
  }
  if (pinned.mergeRequestIid !== current.mergeRequestIid) {
    differences.push(
      `merge request !${pinned.mergeRequestIid} \u2192 !${current.mergeRequestIid}`
    );
  }
  if (current.headSha !== null && pinned.headSha !== current.headSha) {
    differences.push(`head ${short(pinned.headSha)} \u2192 ${short(current.headSha)}`);
  }
  if (current.versionId !== null && pinned.versionId !== current.versionId) {
    differences.push(`diff version ${pinned.versionId} \u2192 ${current.versionId}`);
  }
  if (current.state !== "current") {
    differences.push(current.reason ?? `the merge request revision is ${current.state}`);
  }
  return differences.length === 0 ? { same: true } : { same: false, differences };
}
function short(sha) {
  return sha.slice(0, 12);
}
var CoverageGap = external_exports.strictObject({
  kind: external_exports.enum([
    "aggregate-cap",
    "omitted-files",
    "file-truncated",
    "file-unavailable",
    "no-files"
  ]),
  path: external_exports.string().nullable().default(null),
  detail: external_exports.string().min(1)
});
var ReviewCoverage = external_exports.strictObject({
  complete: external_exports.boolean(),
  declaredFileCount: external_exports.number().int().nonnegative().nullable().default(null),
  deliveredFileCount: external_exports.number().int().nonnegative().default(0),
  versionState: external_exports.string().nullable().default(null),
  gaps: external_exports.array(CoverageGap).default([])
});
var COMPLETE_COVERAGE = {
  complete: true,
  declaredFileCount: null,
  deliveredFileCount: 0,
  versionState: null,
  gaps: []
};

// src/providers/github/provider.ts
var GITHUB_HOSTS = /* @__PURE__ */ new Set(["github.com", "www.github.com", "gist.github.com"]);
var MESSAGE = "AMBICODE does not support GitHub pull requests. Phase 1 implements GitLab merge requests; GitHub is a registered extension point with no API integration behind it.";
var DETAIL = "Review the change locally instead: `ambicode review` for uncommitted work, `ambicode review --branch --base <ref>` for the branch this pull request would carry.";
var GitHubProvider = class {
  id = "github";
  owns(url) {
    try {
      const parsed = new URL(url);
      return GITHUB_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  async resolveTarget() {
    return this.unsupported("resolveTarget");
  }
  async fetchSnapshot() {
    return this.unsupported("fetchSnapshot");
  }
  async getCurrentRevision() {
    return this.unsupported("getCurrentRevision");
  }
  async getIdentity() {
    return this.unsupported("getIdentity");
  }
  async listDiscussions() {
    return this.unsupported("listDiscussions");
  }
  async publishComment() {
    return this.unsupported("publishComment");
  }
  unsupported(operation) {
    return providerUnsupported("github", operation, `${MESSAGE} ${DETAIL}`);
  }
};

// node_modules/isbinaryfile/lib/index.js
import { open, stat as stat2 } from "node:fs/promises";

// node_modules/isbinaryfile/lib/encoding.js
var MAX_BYTES = 512;
function detectUtf16NoBom(fileBuffer, bytesRead) {
  if (bytesRead < 4)
    return null;
  const scanLength = Math.min(bytesRead, MAX_BYTES);
  let nullsAtEven = 0;
  let nullsAtOdd = 0;
  for (let i2 = 0; i2 < scanLength; i2++) {
    if (fileBuffer[i2] === 0) {
      if (i2 % 2 === 0)
        nullsAtEven++;
      else
        nullsAtOdd++;
    }
  }
  const totalNulls = nullsAtEven + nullsAtOdd;
  if (totalNulls > scanLength * 0.3 && totalNulls < scanLength * 0.7) {
    if (nullsAtOdd > nullsAtEven * 3)
      return "utf-16le";
    if (nullsAtEven > nullsAtOdd * 3)
      return "utf-16be";
  }
  return null;
}
function isTextWithEncodingHint(fileBuffer, bytesRead, encoding) {
  const scanLength = Math.min(bytesRead, MAX_BYTES);
  if (encoding === "utf-16" || encoding === "utf-16le" || encoding === "utf-16be") {
    for (let i2 = 0; i2 < scanLength; i2 += 2) {
      const byte1 = fileBuffer[i2];
      const byte2 = i2 + 1 < scanLength ? fileBuffer[i2 + 1] : 0;
      if (encoding === "utf-16le" || encoding === "utf-16") {
        if (byte2 === 0 && byte1 < 32 && byte1 !== 9 && byte1 !== 10 && byte1 !== 13 && byte1 !== 0) {
          return false;
        }
      }
      if (encoding === "utf-16be" || encoding === "utf-16") {
        if (byte1 === 0 && byte2 < 32 && byte2 !== 9 && byte2 !== 10 && byte2 !== 13 && byte2 !== 0) {
          return false;
        }
      }
    }
    return true;
  }
  if (encoding === "latin1" || encoding === "iso-8859-1") {
    for (let i2 = 0; i2 < scanLength; i2++) {
      const byte = fileBuffer[i2];
      if (byte === 0)
        return false;
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        return false;
      }
    }
    return true;
  }
  if (encoding === "cjk" || encoding === "big5" || encoding === "gb2312" || encoding === "gbk" || encoding === "euc-kr" || encoding === "shift-jis") {
    for (let i2 = 0; i2 < scanLength; i2++) {
      const byte = fileBuffer[i2];
      if (byte === 0)
        return false;
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// node_modules/isbinaryfile/lib/index.js
var MAX_BYTES2 = 512;
var UTF8_BOUNDARY_RESERVE = 3;
var Reader = class {
  fileBuffer;
  size;
  offset;
  error;
  constructor(fileBuffer, size) {
    this.fileBuffer = fileBuffer;
    this.size = size;
    this.offset = 0;
    this.error = false;
  }
  hasError() {
    return this.error;
  }
  nextByte() {
    if (this.offset === this.size || this.hasError()) {
      this.error = true;
      return 255;
    }
    return this.fileBuffer[this.offset++];
  }
  next(len) {
    if (len < 0 || len > this.size - this.offset) {
      this.error = true;
      return [];
    }
    const n2 = new Array();
    for (let i2 = 0; i2 < len; i2++) {
      if (this.error) {
        return n2;
      }
      n2[i2] = this.nextByte();
    }
    return n2;
  }
};
function readProtoVarInt(reader) {
  let idx = 0;
  let varInt = 0;
  while (!reader.hasError()) {
    const b = reader.nextByte();
    varInt = varInt | (b & 127) << 7 * idx;
    if ((b & 128) === 0) {
      break;
    }
    if (idx >= 10) {
      reader.error = true;
      break;
    }
    idx++;
  }
  return varInt;
}
function readProtoMessage(reader) {
  const varInt = readProtoVarInt(reader);
  const wireType = varInt & 7;
  switch (wireType) {
    case 0:
      readProtoVarInt(reader);
      return true;
    case 1:
      reader.next(8);
      return true;
    case 2:
      const len = readProtoVarInt(reader);
      reader.next(len);
      return true;
    case 5:
      reader.next(4);
      return true;
  }
  return false;
}
function isBinaryProto(fileBuffer, totalBytes) {
  const reader = new Reader(fileBuffer, totalBytes);
  let numMessages = 0;
  while (true) {
    if (!readProtoMessage(reader) && !reader.hasError()) {
      return false;
    }
    if (reader.hasError()) {
      break;
    }
    numMessages++;
  }
  return numMessages > 0;
}
async function isBinaryFile(file, options) {
  if (isString(file)) {
    const fileStat = await stat2(file);
    isStatFile(fileStat);
    const fileHandle = await open(file, "r");
    try {
      const allocBuffer = Buffer.alloc(MAX_BYTES2 + UTF8_BOUNDARY_RESERVE);
      const { bytesRead } = await fileHandle.read(allocBuffer, 0, MAX_BYTES2 + UTF8_BOUNDARY_RESERVE, 0);
      return isBinaryCheck(allocBuffer, bytesRead, options);
    } finally {
      await fileHandle.close();
    }
  } else {
    const size = options?.size !== void 0 ? options.size : file.length;
    return isBinaryCheck(file, size, options);
  }
}
function isBinaryCheck(fileBuffer, bytesRead, options) {
  if (bytesRead === 0) {
    return false;
  }
  let suspiciousBytes = 0;
  const totalBytes = Math.min(bytesRead, MAX_BYTES2 + UTF8_BOUNDARY_RESERVE);
  const scanBytes = Math.min(totalBytes, MAX_BYTES2);
  if (bytesRead >= 3 && fileBuffer[0] === 239 && fileBuffer[1] === 187 && fileBuffer[2] === 191) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 0 && fileBuffer[1] === 0 && fileBuffer[2] === 254 && fileBuffer[3] === 255) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 255 && fileBuffer[1] === 254 && fileBuffer[2] === 0 && fileBuffer[3] === 0) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 132 && fileBuffer[1] === 49 && fileBuffer[2] === 149 && fileBuffer[3] === 51) {
    return false;
  }
  if (totalBytes >= 5 && fileBuffer.slice(0, 5).toString() === "%PDF-") {
    return true;
  }
  if (bytesRead >= 2 && fileBuffer[0] === 254 && fileBuffer[1] === 255) {
    return false;
  }
  if (bytesRead >= 2 && fileBuffer[0] === 255 && fileBuffer[1] === 254) {
    return false;
  }
  if (options?.encoding) {
    return !isTextWithEncodingHint(fileBuffer, bytesRead, options.encoding);
  }
  const utf16Detected = detectUtf16NoBom(fileBuffer, bytesRead);
  if (utf16Detected) {
    return !isTextWithEncodingHint(fileBuffer, bytesRead, utf16Detected);
  }
  for (let i2 = 0; i2 < scanBytes; i2++) {
    if (fileBuffer[i2] === 0) {
      return true;
    } else if ((fileBuffer[i2] < 7 || fileBuffer[i2] > 14) && (fileBuffer[i2] < 32 || fileBuffer[i2] > 127)) {
      if (fileBuffer[i2] >= 192 && fileBuffer[i2] <= 223 && i2 + 1 < totalBytes) {
        i2++;
        if (fileBuffer[i2] >= 128 && fileBuffer[i2] <= 191) {
          continue;
        }
      } else if (fileBuffer[i2] >= 224 && fileBuffer[i2] <= 239 && i2 + 2 < totalBytes) {
        i2++;
        if (fileBuffer[i2] >= 128 && fileBuffer[i2] <= 191 && fileBuffer[i2 + 1] >= 128 && fileBuffer[i2 + 1] <= 191) {
          i2++;
          continue;
        }
      } else if (fileBuffer[i2] >= 240 && fileBuffer[i2] <= 247 && i2 + 3 < totalBytes) {
        i2++;
        if (fileBuffer[i2] >= 128 && fileBuffer[i2] <= 191 && fileBuffer[i2 + 1] >= 128 && fileBuffer[i2 + 1] <= 191 && fileBuffer[i2 + 2] >= 128 && fileBuffer[i2 + 2] <= 191) {
          i2 += 2;
          continue;
        }
      }
      suspiciousBytes++;
      if (i2 >= 32 && suspiciousBytes * 100 / scanBytes > 10) {
        return true;
      }
    }
  }
  if (suspiciousBytes * 100 / scanBytes > 10) {
    return true;
  }
  if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, scanBytes)) {
    return true;
  }
  return false;
}
function isString(x) {
  return typeof x === "string";
}
function isStatFile(stat3) {
  if (!stat3.isFile()) {
    throw new Error(`Path provided was not a file!`);
  }
}

// src/snapshot/exclusions.ts
var EXCLUDED_PATH_GLOBS = [
  "**/.git/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/.tox/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.gradle/**",
  "**/target/**",
  "**/vendor/**",
  "**/.ambicode/reviews/**",
  "**/.ambicode/task/**"
];
var TEST_PATH_PATTERNS = [
  /(^|\/)[^/]+\.(spec|test|cy)\.[^/]+$/,
  /(^|\/)[^/]+_(test|spec)\.[^/]+$/,
  /(^|\/)test_[^/]+\.py$/,
  /(^|\/)conftest\.py$/,
  /(^|\/)(__tests__|__mocks__|tests|test|spec|e2e|cypress)\//
];
function isTestPath(relativePath) {
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}
var SECRET_NAME_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /\.(pem|key|p12|pfx|jks|keystore|asc|gpg|ppk)$/i,
  /(^|\/)(credentials|secrets?)(\.[A-Za-z0-9]+)?$/i,
  /(^|\/)service-account.*\.json$/i,
  /(^|\/)\.aws\//,
  /(^|\/)\.ssh\//
];
var BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "avif",
  "tif",
  "tiff",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "zst",
  "7z",
  "rar",
  "jar",
  "war",
  "mp3",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "wav",
  "flac",
  "ogg",
  "webm",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "so",
  "dylib",
  "dll",
  "exe",
  "bin",
  "o",
  "a",
  "class",
  "pyc",
  "wasm",
  "sqlite",
  "db",
  "parquet"
]);
var GENERATED_CONTEXT_NAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "go.sum"
]);
function isUselessAsContext(relativePath) {
  return GENERATED_CONTEXT_NAMES.has(relativePath.split("/").pop() ?? "");
}
function pathExclusionReason(relativePath, operator = {}) {
  if (matchesAnyGlob(relativePath, EXCLUDED_PATH_GLOBS)) return "excluded-directory";
  const exclude = operator.exclude ?? [];
  if (exclude.length > 0 && matchesAnyGlob(relativePath, exclude)) return "operator-pattern";
  if (operator.excludeTests === true && isTestPath(relativePath)) return "test-file";
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(relativePath))) return "credential-like-name";
  const extension = relativePath.split(".").pop()?.toLowerCase();
  if (extension !== void 0 && BINARY_EXTENSIONS.has(extension)) return "binary-extension";
  return null;
}
async function isBinaryContent(bytes) {
  return await isBinaryFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
function describeExclusion(reason) {
  switch (reason) {
    case "excluded-directory":
      return "inside a dependency, build output, or version-control directory";
    case "operator-pattern":
      return "excluded by a path pattern this run was given (--exclude or review.excludePaths)";
    case "not-selected":
      return "outside the paths this run was told to review (--only)";
    case "test-file":
      return "test code, which merge-request review leaves out unless --with-tests is passed";
    case "credential-like-name":
      return "the name matches a credential or private-key pattern";
    case "binary-extension":
      return "a binary file extension";
    case "binary-content":
      return "the contents are binary";
    case "too-large":
      return "larger than the configured snapshot budget";
    case "symlink":
      return "a symbolic link, which AMBICODE reports but does not follow";
  }
}
function isExcludedFromReview(oldPath, newPath, operator = {}) {
  const names = [newPath, oldPath].filter((name) => name !== null);
  const include = operator.include ?? [];
  if (include.length > 0 && !names.some((name) => matchesAnyGlob(name, include))) {
    return "not-selected";
  }
  for (const candidate of names) {
    const reason = pathExclusionReason(candidate, operator);
    if (reason !== null) return reason;
  }
  return null;
}

// src/git/diff.ts
function combineDiff(changes, patch) {
  const sections = splitPatchSections(patch);
  if (sections.length !== changes.length) {
    throw new AmbicodeError(
      "diff-mismatch",
      `git reported ${changes.length} changed files but produced ${sections.length} patch sections.`,
      { details: ["AMBICODE will not guess which patch belongs to which file."] }
    );
  }
  return changes.map((change, index) => {
    const section = sections[index] ?? "";
    const binary = /^Binary files .* differ$/m.test(section) || /^GIT binary patch$/m.test(section);
    const hunks = binary ? [] : parseHunks(section);
    return {
      oldPath: change.oldPath,
      newPath: change.newPath,
      changeKind: change.changeKind,
      binary,
      addedLines: hunks.reduce((total, hunk) => total + hunk.lines.filter((l) => l.kind === "added").length, 0),
      removedLines: hunks.reduce((total, hunk) => total + hunk.lines.filter((l) => l.kind === "removed").length, 0),
      hunks,
      patchSection: section
    };
  });
}
function splitPatchSections(patch) {
  if (patch.trim() === "") return [];
  const sections = [];
  let current = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current !== null) sections.push(current.join("\n"));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) sections.push(current.join("\n"));
  return sections;
}
var HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
function parseHunks(section) {
  const lines = section.split("\n");
  const hunks = [];
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunks = false;
  for (const line of lines) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      inHunks = true;
      hunk = {
        oldStart: Number(header[1]),
        oldLines: header[2] === void 0 ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === void 0 ? 1 : Number(header[4]),
        lines: []
      };
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      hunks.push(hunk);
      continue;
    }
    if (!inHunks || hunk === null) continue;
    if (line.startsWith("\\")) continue;
    const marker = line.charAt(0);
    const text = line.slice(1);
    if (marker === "+") {
      hunk.lines.push({ kind: "added", oldLine: null, newLine, text });
      newLine += 1;
    } else if (marker === "-") {
      hunk.lines.push({ kind: "removed", oldLine, newLine: null, text });
      oldLine += 1;
    } else if (marker === " ") {
      hunk.lines.push({ kind: "context", oldLine, newLine, text });
      oldLine += 1;
      newLine += 1;
    } else if (line === "") {
      continue;
    } else {
      inHunks = false;
    }
  }
  return hunks;
}
function addressableLines(file, side) {
  const lines = /* @__PURE__ */ new Set();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const number = side === "old" ? line.oldLine : line.newLine;
      if (number !== null) lines.add(number);
    }
  }
  return lines;
}
function lineAt(file, side, line) {
  for (const hunk of file.hunks) {
    for (const candidate of hunk.lines) {
      const number = side === "old" ? candidate.oldLine : candidate.newLine;
      if (number === line) return candidate;
    }
  }
  return null;
}
function totalChangedLines(files) {
  return files.reduce((total, file) => total + file.addedLines + file.removedLines, 0);
}

// src/providers/position.ts
function positionForLocation(target, files, location) {
  const named = location.side === "new" ? location.newPath : location.oldPath;
  if (named === null) {
    return { kind: "unmappable", reason: `the finding names no ${location.side}-side path.` };
  }
  const file = files.find(
    (candidate) => location.side === "new" ? candidate.newPath === named : candidate.oldPath === named
  );
  if (file === void 0) {
    return { kind: "unmappable", reason: `"${named}" is not a file in the pinned diff.` };
  }
  const line = lineAt(file, location.side, location.line);
  if (line === null) {
    return {
      kind: "unmappable",
      reason: `line ${location.line} is not on the ${location.side} side of "${named}" in the pinned diff.`
    };
  }
  const shas = { baseSha: target.baseSha, startSha: target.startSha, headSha: target.headSha };
  switch (line.kind) {
    case "added":
      return {
        kind: "ok",
        position: {
          ...shas,
          oldPath: file.oldPath ?? file.newPath,
          newPath: file.newPath,
          oldLine: null,
          newLine: line.newLine
        }
      };
    case "removed":
      return {
        kind: "ok",
        position: {
          ...shas,
          oldPath: file.oldPath,
          newPath: file.newPath ?? file.oldPath,
          oldLine: line.oldLine,
          newLine: null
        }
      };
    case "context":
      return {
        kind: "ok",
        position: {
          ...shas,
          oldPath: file.oldPath,
          newPath: file.newPath,
          oldLine: line.oldLine,
          newLine: line.newLine
        }
      };
  }
}
function toGitLabPositionFields(position) {
  const fields = {
    position_type: "text",
    base_sha: position.baseSha,
    start_sha: position.startSha,
    head_sha: position.headSha
  };
  if (position.oldPath !== null) fields.old_path = position.oldPath;
  if (position.newPath !== null) fields.new_path = position.newPath;
  if (position.oldLine !== null) fields.old_line = position.oldLine;
  if (position.newLine !== null) fields.new_line = position.newLine;
  return fields;
}

// src/providers/gitlab/api.ts
var GLAB_TIMEOUT_MS = 6e4;
var GLAB_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
var PAGE_SIZE = 100;
var GitLabApi = class {
  runner;
  host;
  cwd;
  executable;
  timeoutMs;
  maxOutputBytes;
  constructor(options) {
    this.runner = options.runner;
    this.host = options.host;
    this.cwd = options.cwd;
    this.executable = options.executable ?? "glab";
    this.timeoutMs = options.timeoutMs ?? GLAB_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? GLAB_MAX_OUTPUT_BYTES;
  }
  argvFor(request) {
    const query = Object.entries(request.query ?? {}).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`).join("&");
    return [
      this.executable,
      "api",
      // glab otherwise infers the host from the checkout's remote, not the one the URL named.
      "--hostname",
      this.host,
      "--method",
      request.method ?? "GET",
      // `glab api --input -` sets no Content-Type of its own, and GitLab answers HTTP 415 before
      // it looks at the request at all.
      ...request.body === void 0 ? [] : ["--header", "Content-Type: application/json", "--input", "-"],
      query === "" ? request.path : `${request.path}?${query}`
    ];
  }
  async request(request, schema) {
    const argv = this.argvFor(request);
    const outcome2 = await this.runner.run({
      argv,
      cwd: this.cwd,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      env: { kind: "inherited", overrides: { NO_COLOR: "1", GLAB_CHECK_UPDATE: "false" } },
      ...request.body === void 0 ? {} : { stdin: JSON.stringify(request.body) }
    });
    if (outcome2.kind === "spawn-failed") {
      return failed(
        `glab could not be started: ${outcome2.failure ?? "unknown spawn failure"}.`,
        ["AMBICODE talks to GitLab only through the glab CLI; install it and run `glab auth login` for this host."],
        "before-send"
      );
    }
    if (outcome2.kind === "timed-out") {
      return failed(`glab api ${request.path} timed out after ${Math.round(this.timeoutMs / 1e3)}s.`);
    }
    if (outcome2.truncated) {
      return failed(`glab api ${request.path} produced more output than AMBICODE reads, so it was not parsed.`, [
        "The response was not parsed and nothing was inferred from its prefix."
      ]);
    }
    if (outcome2.exitCode !== 0) {
      const diagnostic = firstLine(outcome2.stderr) || firstLine(outcome2.stdout) || "glab produced no diagnostic.";
      return failed(
        `glab api ${request.path} failed with exit code ${String(outcome2.exitCode)}: ${diagnostic}`,
        [diagnostic]
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(outcome2.stdout);
    } catch (error) {
      return failed(`glab api ${request.path} did not return JSON.`, [
        error instanceof Error ? error.message : String(error)
      ]);
    }
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return failed(`The GitLab response for ${request.path} does not match what AMBICODE expects.`, [
        ...validated.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
        "AMBICODE will not work from a response it could not validate."
      ]);
    }
    return { kind: "ok", value: validated.data };
  }
  async graphql(query, variables, schema) {
    return await this.request({ path: "graphql", method: "POST", body: { query, variables } }, schema);
  }
  /**
   * GitLab never says "there is more", so pages are read until a short one; a failed page fails the
   * whole listing, and `maxItems` is a hard ceiling even when one page exceeds it.
   */
  async collect(request, itemSchema, options = {}) {
    const arraySchema = external_exports.array(itemSchema);
    const items = [];
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
    let page = 1;
    for (; ; ) {
      const result = await this.request(
        { ...request, query: { ...request.query ?? {}, per_page: PAGE_SIZE, page } },
        arraySchema
      );
      if (result.kind !== "ok") {
        return failed(
          `${result.message} (page ${page} of ${request.path})`,
          [
            ...result.details,
            `${items.length} item(s) had already been read; a partial listing is not returned as a complete one.`
          ],
          result.certainty
        );
      }
      items.push(...result.value);
      if (items.length > maxItems) {
        return { kind: "ok", value: { items: items.slice(0, maxItems), capped: true, pages: page } };
      }
      if (result.value.length < PAGE_SIZE) {
        return { kind: "ok", value: { items, capped: false, pages: page } };
      }
      page += 1;
    }
  }
};
function failed(message, details = [], certainty = "uncertain") {
  return { kind: "failed", message, details, certainty };
}
function firstLine(value) {
  return value.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
}

// src/providers/gitlab/schemas.ts
var ProjectId = external_exports.union([external_exports.number().int().positive(), external_exports.string().min(1)]).transform(String);
var Sha = external_exports.string().regex(/^[0-9a-f]{7,64}$/, { error: "expected a commit sha" });
var GitLabProject = external_exports.looseObject({
  id: ProjectId,
  path_with_namespace: external_exports.string().min(1)
});
var GitLabDiffRefs = external_exports.looseObject({
  base_sha: Sha.nullable(),
  start_sha: Sha.nullable(),
  head_sha: Sha.nullable()
});
var GitLabMergeRequest = external_exports.looseObject({
  iid: external_exports.number().int().positive(),
  project_id: ProjectId,
  source_project_id: ProjectId.nullable(),
  target_project_id: ProjectId,
  web_url: external_exports.string().min(1),
  state: external_exports.string(),
  title: external_exports.string().default(""),
  sha: Sha.nullable().default(null),
  diff_refs: GitLabDiffRefs.nullable().default(null)
});
var GitLabVersion = external_exports.looseObject({
  id: external_exports.number().int().positive(),
  head_commit_sha: Sha,
  base_commit_sha: Sha.nullable(),
  start_commit_sha: Sha.nullable(),
  created_at: external_exports.string().nullable().default(null),
  state: external_exports.string().nullable().default(null)
});
var GitLabVersionDiff = external_exports.looseObject({
  old_path: external_exports.string(),
  new_path: external_exports.string(),
  a_mode: external_exports.string().nullable().default(null),
  b_mode: external_exports.string().nullable().default(null),
  new_file: external_exports.boolean().default(false),
  renamed_file: external_exports.boolean().default(false),
  deleted_file: external_exports.boolean().default(false),
  /** Absent or empty when GitLab collapsed or capped this file. */
  diff: external_exports.string().default(""),
  too_large: external_exports.boolean().nullable().default(null),
  collapsed: external_exports.boolean().nullable().default(null),
  generated_file: external_exports.boolean().nullable().default(null)
});
var GitLabVersionDetail = GitLabVersion.extend({
  diffs: external_exports.array(GitLabVersionDiff).default([]),
  real_size: external_exports.string().nullable().default(null)
});
var GitLabCompare = external_exports.looseObject({
  compare_timeout: external_exports.boolean().default(false),
  compare_same_ref: external_exports.boolean().default(false),
  diffs: external_exports.array(external_exports.looseObject({ old_path: external_exports.string(), new_path: external_exports.string() })).default([])
});
var GitLabFile = external_exports.looseObject({
  file_path: external_exports.string(),
  size: external_exports.number().int().nonnegative().nullable().default(null),
  encoding: external_exports.string().nullable().default(null),
  content: external_exports.string().nullable().default(null)
});
var GitLabTreeEntry = external_exports.looseObject({
  name: external_exports.string().min(1),
  path: external_exports.string().min(1),
  type: external_exports.enum(["blob", "tree", "commit"]),
  mode: external_exports.string().nullable().default(null)
});
var GitLabNotePosition = external_exports.looseObject({
  base_sha: external_exports.string().nullable().default(null),
  start_sha: external_exports.string().nullable().default(null),
  head_sha: external_exports.string().nullable().default(null),
  old_path: external_exports.string().nullable().default(null),
  new_path: external_exports.string().nullable().default(null),
  old_line: external_exports.number().int().positive().nullable().default(null),
  new_line: external_exports.number().int().positive().nullable().default(null)
});
var GitLabNote = external_exports.looseObject({
  id: external_exports.union([external_exports.number().int(), external_exports.string().min(1)]).transform(String),
  body: external_exports.string().default(""),
  author: external_exports.looseObject({ username: external_exports.string().default(""), name: external_exports.string().default("") }).nullable().default(null),
  created_at: external_exports.string().nullable().default(null),
  updated_at: external_exports.string().nullable().default(null),
  system: external_exports.boolean().default(false),
  resolvable: external_exports.boolean().default(false),
  resolved: external_exports.boolean().nullable().default(null),
  position: GitLabNotePosition.nullable().default(null)
});
var GitLabDiscussion = external_exports.looseObject({
  id: external_exports.string().min(1),
  individual_note: external_exports.boolean().default(false),
  notes: external_exports.array(GitLabNote).default([])
});
var GitLabCreatedDiscussion = external_exports.looseObject({
  id: external_exports.string().min(1),
  notes: external_exports.array(GitLabNote).default([])
});
var GitLabUser = external_exports.looseObject({
  username: external_exports.string().min(1),
  name: external_exports.string().default("")
});
var GitLabBlobBatch = external_exports.object({
  data: external_exports.object({
    project: external_exports.object({
      repository: external_exports.object({
        blobs: external_exports.object({
          pageInfo: external_exports.object({ hasNextPage: external_exports.boolean() }),
          nodes: external_exports.array(
            external_exports.looseObject({
              path: external_exports.string().min(1),
              rawSize: external_exports.string().nullable().default(null),
              /** Empty for a blob GitLab does not serve as text. */
              rawTextBlob: external_exports.string().nullable().default(null)
            })
          )
        })
      }).nullable()
    }).nullable()
  })
});

// src/providers/gitlab/url.ts
var VIEW_SUFFIXES = /* @__PURE__ */ new Set(["diffs", "commits", "pipelines", "reports", "widget"]);
var MERGE_REQUEST_SEGMENT = "merge_requests";
function parseMergeRequestUrl(value) {
  const raw = value.trim();
  if (raw === "") return invalid("No merge request URL was given.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    return invalid(`"${raw}" is not a URL.`, [
      "Pass the full merge request URL, for example https://gitlab.example.com/group/project/-/merge_requests/42."
    ]);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return invalid(`"${url.protocol.replace(":", "")}" is not a supported scheme for a merge request URL.`, [
      "AMBICODE resolves merge requests over HTTP(S) only; an ssh or git remote is not a merge request address."
    ]);
  }
  if (url.username !== "" || url.password !== "") {
    return invalid("The merge request URL carries credentials.", [
      "Remove the user information from the URL. AMBICODE authenticates through the glab configuration for that host."
    ]);
  }
  if (url.hostname === "") return invalid("The merge request URL has no host.");
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const marker = segments.findIndex(
    (segment, index) => segment === "-" && segments[index + 1] === MERGE_REQUEST_SEGMENT
  );
  if (marker < 0) {
    return invalid(`"${raw}" is not a merge request URL.`, [
      'The path must contain "/-/merge_requests/<iid>".',
      "A project, issue, pipeline or branch URL does not identify a merge request."
    ]);
  }
  const iidSegment = segments[marker + 2];
  if (iidSegment === void 0) {
    return invalid("The merge request URL has no merge request number.", [
      'Expected "/-/merge_requests/<iid>", for example "/-/merge_requests/42".'
    ]);
  }
  if (!/^[1-9][0-9]*$/.test(iidSegment)) {
    return invalid(`"${iidSegment}" is not a merge request number.`, [
      "The merge request iid is a positive decimal integer without leading zeroes."
    ]);
  }
  const mergeRequestIid = Number(iidSegment);
  if (!Number.isSafeInteger(mergeRequestIid)) {
    return invalid(`"${iidSegment}" is larger than a merge request number can be.`);
  }
  const trailing = segments.slice(marker + 3);
  if (trailing.length > 1 || trailing.length === 1 && !VIEW_SUFFIXES.has(trailing[0])) {
    return invalid(`"${raw}" points inside a merge request rather than at it.`, [
      `Unexpected path after the merge request number: ${trailing.join("/")}.`,
      "Pass the merge request URL itself, optionally ending in /diffs or /commits."
    ]);
  }
  const projectSegments = segments.slice(0, marker);
  const decoded = decodeProjectPath(projectSegments);
  if (typeof decoded === "string") return invalid(decoded);
  const host = url.port === "" ? url.hostname : `${url.hostname}:${url.port}`;
  return {
    kind: "ok",
    ref: {
      host,
      projectPath: decoded.join("/"),
      mergeRequestIid,
      canonicalUrl: `${url.protocol}//${host}/${decoded.join("/")}/-/merge_requests/${mergeRequestIid}`
    }
  };
}
function decodeProjectPath(segments) {
  if (segments.length < 2) {
    return "The merge request URL does not name a namespace and a project.";
  }
  const decoded = [];
  for (const segment of segments) {
    let value;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return `"${segment}" in the project path is not valid percent-encoding.`;
    }
    if (value === "") return "The project path has an empty segment.";
    if (value === "." || value === "..") {
      return `"${value}" is not a project path segment.`;
    }
    if (value.includes("/") || value.includes("\\")) {
      return `An encoded separator in "${segment}" makes the project path ambiguous.`;
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      return "The project path contains a control character.";
    }
    if (value === "-") {
      return 'The project path contains a "-" segment, which GitLab reserves.';
    }
    decoded.push(value);
  }
  return decoded;
}
function encodeProjectIdentity(pathOrId) {
  return encodeURIComponent(pathOrId);
}
function invalid(reason, details = []) {
  return { kind: "invalid", reason, details };
}

// src/providers/gitlab/provider.ts
var GITLAB_HOST_PATTERN = /(^|\.)gitlab\b/i;
var SYMLINK_MODE = "120000";
var GITLINK_MODE = "160000";
var CAPPED_VERSION_STATES = /* @__PURE__ */ new Set(["overflow", "without_files", "timeout"]);
var MAX_BLOB_BATCH_PATHS = 100;
var BLOB_BATCH_QUERY = "query($project:ID!,$paths:[String!]!,$ref:String!){project(fullPath:$project){repository{blobs(paths:$paths,ref:$ref){pageInfo{hasNextPage} nodes{path rawSize rawTextBlob}}}}}";
var GitLabProvider = class {
  id = "gitlab";
  options;
  constructor(options) {
    this.options = options;
  }
  /** Matched by path shape, so self-hosted GitLab on any hostname works; the hostname only breaks ties. */
  owns(url) {
    const parsed = parseMergeRequestUrl(url);
    if (parsed.kind === "ok") return true;
    try {
      return GITLAB_HOST_PATTERN.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  apiFor(host) {
    return new GitLabApi({
      runner: this.options.runner,
      host,
      cwd: this.options.cwd,
      ...this.options.executable === void 0 ? {} : { executable: this.options.executable },
      ...this.options.timeoutMs === void 0 ? {} : { timeoutMs: this.options.timeoutMs },
      ...this.options.maxOutputBytes === void 0 ? {} : { maxOutputBytes: this.options.maxOutputBytes }
    });
  }
  async resolveTarget(request) {
    const parsed = parseMergeRequestUrl(request.url);
    if (parsed.kind === "invalid") {
      return providerFailed("gitlab", "resolveTarget", parsed.reason, [
        ...parsed.details,
        "No request was made to GitLab."
      ]);
    }
    const ref = parsed.ref;
    const api = this.apiFor(ref.host);
    const project = await api.request(
      { path: `projects/${encodeProjectIdentity(ref.projectPath)}` },
      GitLabProject
    );
    if (project.kind !== "ok") return this.fail("resolveTarget", project);
    const [mergeRequest, versions] = await Promise.all([
      api.request({ path: mergeRequestPath(project.value.id, ref.mergeRequestIid) }, GitLabMergeRequest),
      api.collect(
        { path: `${mergeRequestPath(project.value.id, ref.mergeRequestIid)}/versions` },
        GitLabVersion
      )
    ]);
    if (mergeRequest.kind !== "ok") return this.fail("resolveTarget", mergeRequest);
    if (versions.kind !== "ok") return this.fail("resolveTarget", versions);
    const selected = versions.value.items[0];
    if (selected === void 0) {
      return providerFailed("gitlab", "resolveTarget", "This merge request has no collected diff version.", [
        "GitLab had not finished collecting the diff, or the merge request has no commits.",
        "AMBICODE does not fall back to the local HEAD as a remote revision."
      ]);
    }
    if (selected.base_commit_sha === null || selected.start_commit_sha === null) {
      return providerFailed(
        "gitlab",
        "resolveTarget",
        `Diff version ${selected.id} does not carry a base and start commit, so positions could not be pinned.`,
        ["A comment without exact base/start/head SHAs would land on the wrong lines."]
      );
    }
    const sourceProjectId = mergeRequest.value.source_project_id ?? project.value.id;
    const sourceProjectPath = sourceProjectId === project.value.id ? project.value.path_with_namespace : await this.sourceProjectPath(api, sourceProjectId);
    return providerOk({
      provider: "gitlab",
      host: ref.host,
      projectId: project.value.id,
      projectPath: project.value.path_with_namespace,
      sourceProjectId,
      sourceProjectPath,
      mergeRequestIid: mergeRequest.value.iid,
      webUrl: mergeRequest.value.web_url,
      versionId: selected.id,
      baseSha: selected.base_commit_sha,
      startSha: selected.start_commit_sha,
      headSha: selected.head_commit_sha
    });
  }
  async sourceProjectPath(api, sourceProjectId) {
    const source = await api.request({ path: `projects/${encodeProjectIdentity(sourceProjectId)}` }, GitLabProject);
    return source.kind === "ok" ? source.value.path_with_namespace : sourceProjectId;
  }
  async fetchSnapshot(request) {
    const target = request.target;
    const api = this.apiFor(target.host);
    const version = await api.request(
      {
        path: `${mergeRequestPath(target.projectId, target.mergeRequestIid)}/versions/${target.versionId}`
      },
      GitLabVersionDetail
    );
    if (version.kind !== "ok") return this.fail("fetchSnapshot", version);
    if (version.value.head_commit_sha !== target.headSha) {
      return providerFailed(
        "gitlab",
        "fetchSnapshot",
        `Diff version ${target.versionId} now reports head ${version.value.head_commit_sha.slice(0, 12)}, not the pinned ${target.headSha.slice(0, 12)}.`,
        ["The review was not built, because its evidence would not describe one revision."]
      );
    }
    const omissions = [];
    const delivered = [];
    const symlinkPaths = /* @__PURE__ */ new Set();
    for (const entry of version.value.diffs) {
      const file = toFetchedFile(entry);
      if (file.incompleteReason !== null) {
        omissions.push(
          `${entry.new_path || entry.old_path}: GitLab did not deliver this file's diff in full (${file.incompleteReason}), so its change is not part of the reviewed evidence.`
        );
      }
      if (file.symlink && file.newPath !== null) symlinkPaths.add(file.newPath);
      delivered.push(file);
    }
    const coverage = assessCoverage(version.value, delivered);
    const stillDiffers = await this.pathsDifferingFromTarget(api, target);
    const files = stillDiffers === null ? delivered : delivered.filter((file) => {
      const named = file.newPath ?? file.oldPath;
      return named === null || stillDiffers.has(named);
    });
    const dropped = delivered.length - files.length;
    if (stillDiffers === null) {
      omissions.push(
        "Whether each changed file still differs from the target branch could not be established, so the whole merge-request diff was reviewed, including any part of it that is already on the target branch."
      );
    } else if (dropped > 0) {
      omissions.push(
        `${dropped} of the merge request's ${delivered.length} changed file(s) are already identical to ${target.projectPath}'s target branch at ${target.startSha.slice(0, 12)}, so merging changes nothing in them and they were not reviewed. The ${files.length} file(s) that would actually change were.`
      );
    }
    const sections = files.map((file) => file.patchSection);
    for (const gap of coverage.gaps) {
      if (gap.kind === "file-truncated") continue;
      omissions.push(gap.detail);
    }
    const content = new RemoteContent(
      api,
      target,
      request.includeSiblingContext,
      symlinkPaths,
      (message) => omissions.push(message)
    );
    return providerOk({
      files,
      patch: sections.join(""),
      read: (relativePath) => content.read(relativePath),
      list: (directoryName) => content.list(directoryName),
      prime: (relativePaths) => content.prime(relativePaths),
      omissions,
      coverage
    });
  }
  /**
   * Reads both the merge request head and the newest collected version: they disagree while GitLab
   * is still collecting a push, and the version alone would pass a superseded revision as current.
   */
  async getCurrentRevision(target) {
    const api = this.apiFor(target.host);
    const identity3 = {
      provider: "gitlab",
      host: target.host,
      projectId: target.projectId,
      mergeRequestIid: target.mergeRequestIid
    };
    const mergeRequest = await api.request(
      { path: mergeRequestPath(target.projectId, target.mergeRequestIid) },
      GitLabMergeRequest
    );
    if (mergeRequest.kind !== "ok") {
      return providerOk({
        ...identity3,
        state: "unavailable",
        headSha: null,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: null,
        reason: `The merge request could not be read: ${mergeRequest.message}`
      });
    }
    const mr = mergeRequest.value;
    if (mr.state !== "opened") {
      return providerOk({
        ...identity3,
        state: "unavailable",
        headSha: mr.sha,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: `The merge request is ${mr.state}, so a review comment can no longer be attached to its diff.`
      });
    }
    if (mr.diff_refs === null || mr.diff_refs.head_sha === null) {
      return providerOk({
        ...identity3,
        state: "collecting",
        headSha: mr.sha,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: "GitLab has not published current diff refs for this merge request, which means it is still collecting the diff for the newest push."
      });
    }
    const currentHead = mr.sha ?? mr.diff_refs.head_sha;
    if (!sameSha(currentHead, mr.diff_refs.head_sha)) {
      return providerOk({
        ...identity3,
        state: "collecting",
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: mr.diff_refs.head_sha,
        mergeRequestState: mr.state,
        reason: `The merge request head is ${currentHead.slice(0, 12)} but its diff refs still describe ${mr.diff_refs.head_sha.slice(0, 12)}; GitLab is still collecting.`
      });
    }
    const versions = await api.collect(
      { path: `${mergeRequestPath(target.projectId, target.mergeRequestIid)}/versions` },
      GitLabVersion
    );
    if (versions.kind !== "ok") {
      return providerOk({
        ...identity3,
        state: "unavailable",
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: `The collected diff versions could not be read: ${versions.message}`
      });
    }
    const newest = versions.value.items[0];
    if (newest === void 0) {
      return providerOk({
        ...identity3,
        state: "collecting",
        headSha: currentHead,
        versionId: null,
        collectedHeadSha: null,
        mergeRequestState: mr.state,
        reason: "This merge request has no collected diff version."
      });
    }
    if (!sameSha(newest.head_commit_sha, currentHead)) {
      return providerOk({
        ...identity3,
        state: "collecting",
        headSha: currentHead,
        versionId: newest.id,
        collectedHeadSha: newest.head_commit_sha,
        mergeRequestState: mr.state,
        reason: `The merge request head is ${currentHead.slice(0, 12)}, but the newest collected diff version ${newest.id} still describes ${newest.head_commit_sha.slice(0, 12)}. GitLab has not collected the newest push yet.`
      });
    }
    if (!sameSha(currentHead, target.headSha) || newest.id !== target.versionId) {
      return providerOk({
        ...identity3,
        state: "stale",
        headSha: currentHead,
        versionId: newest.id,
        collectedHeadSha: newest.head_commit_sha,
        mergeRequestState: mr.state,
        reason: `The merge request has moved since the review: pinned ${target.headSha.slice(0, 12)} (version ${target.versionId}), current ${currentHead.slice(0, 12)} (version ${newest.id}).`
      });
    }
    return providerOk({
      ...identity3,
      state: "current",
      headSha: currentHead,
      versionId: newest.id,
      collectedHeadSha: newest.head_commit_sha,
      mergeRequestState: mr.state,
      reason: null
    });
  }
  async getIdentity(target) {
    const api = this.apiFor(target.host);
    const user = await api.request({ path: "user" }, GitLabUser);
    if (user.kind !== "ok") return this.fail("getIdentity", user);
    return providerOk({ username: user.value.username, displayName: user.value.name });
  }
  async listDiscussions(request) {
    const api = this.apiFor(request.target.host);
    const collected = await api.collect(
      { path: `${mergeRequestPath(request.target.projectId, request.target.mergeRequestIid)}/discussions` },
      GitLabDiscussion,
      { maxItems: request.maxDiscussions }
    );
    if (collected.kind !== "ok") return this.fail("listDiscussions", collected);
    const omissions = collected.value.capped ? [
      `Only the first ${request.maxDiscussions} merge request discussion(s) were read. Older threads exist and were not shown to the reviewer.`
    ] : [];
    return providerOk({
      discussions: collected.value.items.map(toRemoteDiscussion),
      complete: !collected.value.capped,
      omissions
    });
  }
  /** Reached only from the publication run the human form authorizes; no CLI or skill path calls it. */
  async publishComment(request) {
    const api = this.apiFor(request.target.host);
    const created = await api.request(
      {
        path: `${mergeRequestPath(request.target.projectId, request.target.mergeRequestIid)}/discussions`,
        method: "POST",
        body: { body: request.body, position: toGitLabPositionFields(request.position) }
      },
      GitLabCreatedDiscussion
    );
    if (created.kind !== "ok") return this.fail("publishComment", created);
    const note = created.value.notes[0];
    if (note === void 0) {
      return providerFailed(
        "gitlab",
        "publishComment",
        "GitLab accepted the discussion but returned no note, so delivery could not be confirmed.",
        ["Query the discussions before retrying; a lost response can still mean the comment exists."]
      );
    }
    return providerOk({
      discussionId: created.value.id,
      noteId: note.id,
      url: `${request.target.webUrl}#note_${note.id}`
    });
  }
  /**
   * Null, never a partial set, on any doubt: a partial answer would silently narrow the review.
   * It only removes paths from GitLab's own diff, so it cannot invent a change.
   */
  async pathsDifferingFromTarget(api, target) {
    if (sameSha(target.startSha, target.headSha)) return null;
    const compared = await api.request(
      {
        path: `projects/${encodeProjectIdentity(target.projectId)}/repository/compare`,
        query: { from: target.startSha, to: target.headSha, straight: "true" }
      },
      GitLabCompare
    );
    if (compared.kind !== "ok" || compared.value.compare_timeout) return null;
    const paths = /* @__PURE__ */ new Set();
    for (const entry of compared.value.diffs) {
      if (entry.new_path !== "") paths.add(entry.new_path);
      if (entry.old_path !== "") paths.add(entry.old_path);
    }
    return paths;
  }
  fail(operation, result) {
    return providerFailed("gitlab", operation, result.message, result.details, result.certainty);
  }
};
function sameSha(left, right) {
  if (left === null || right === null) return false;
  const length = Math.min(left.length, right.length);
  if (length < 7) return false;
  return left.slice(0, length) === right.slice(0, length);
}
function assessCoverage(version, files) {
  const gaps = [];
  const declared = parseRealSize(version.real_size);
  const delivered = files.length;
  if (version.state !== null && CAPPED_VERSION_STATES.has(version.state)) {
    gaps.push({
      kind: "aggregate-cap",
      path: null,
      detail: `GitLab reports the pinned diff version's collection state as "${version.state}", which means it did not deliver every changed file. The review covers only the files it sent.`
    });
  }
  if (declared !== null && declared > delivered) {
    gaps.push({
      kind: "omitted-files",
      path: null,
      detail: `GitLab declares ${declared} changed file(s) for the pinned version but delivered ${delivered}. The missing ${declared - delivered} file(s) were not reviewed.`
    });
  }
  if (delivered === 0) {
    gaps.push({
      kind: "no-files",
      path: null,
      detail: "GitLab returned no file diffs for the pinned version, so there is nothing to review."
    });
  }
  for (const file of files) {
    if (file.incompleteReason === null) continue;
    gaps.push({
      kind: "file-truncated",
      path: file.newPath ?? file.oldPath,
      detail: `${file.newPath ?? file.oldPath ?? "(unnamed)"}: ${file.incompleteReason}.`
    });
  }
  return {
    complete: gaps.length === 0,
    declaredFileCount: declared,
    deliveredFileCount: delivered,
    versionState: version.state,
    gaps
  };
}
function parseRealSize(value) {
  if (value === null) return null;
  const match = /^\s*(\d+)\s*\+?\s*$/.exec(value);
  if (match === null) return null;
  return Number.parseInt(match[1], 10);
}
var RemoteContent = class {
  api;
  target;
  includeSiblings;
  symlinkPaths;
  note;
  files = /* @__PURE__ */ new Map();
  trees = /* @__PURE__ */ new Map();
  constructor(api, target, includeSiblings, symlinkPaths, note) {
    this.api = api;
    this.target = target;
    this.includeSiblings = includeSiblings;
    this.symlinkPaths = symlinkPaths;
    this.note = note;
  }
  async read(relativePath) {
    const cached = this.files.get(relativePath);
    if (cached !== void 0) return cached;
    const value = await this.fetch(relativePath);
    this.files.set(relativePath, value);
    return value;
  }
  /**
   * A batched fast path only: any path it cannot verify stays uncached and `read` fetches it per
   * file, where bytes are classified before decoding. So it can only be faster, never different.
   */
  async prime(relativePaths) {
    if (!this.target.sourceProjectPath.includes("/")) return;
    const wanted = relativePaths.filter(
      (relativePath) => !this.files.has(relativePath) && !this.symlinkPaths.has(relativePath)
    );
    for (let start = 0; start < wanted.length; start += MAX_BLOB_BATCH_PATHS) {
      await this.primeBatch(wanted.slice(start, start + MAX_BLOB_BATCH_PATHS));
    }
  }
  async primeBatch(paths) {
    const result = await this.api.graphql(
      BLOB_BATCH_QUERY,
      { project: this.target.sourceProjectPath, paths, ref: this.target.headSha },
      GitLabBlobBatch
    );
    if (result.kind !== "ok") return;
    const blobs = result.value.data.project?.repository?.blobs;
    if (blobs === void 0 || blobs.pageInfo.hasNextPage) return;
    for (const node of blobs.nodes) {
      if (!paths.includes(node.path)) continue;
      const rawSize = node.rawSize === null ? null : Number(node.rawSize);
      if (rawSize === null || !Number.isSafeInteger(rawSize)) continue;
      if (rawSize > MAX_SNAPSHOT_FILE_BYTES) {
        this.files.set(node.path, { kind: "too-large", bytes: rawSize });
        continue;
      }
      const text = node.rawTextBlob ?? "";
      if (Buffer.byteLength(text, "utf8") !== rawSize) continue;
      this.files.set(node.path, rawSize === 0 ? { kind: "text", text: "" } : { kind: "text", text });
    }
  }
  async fetch(relativePath) {
    if (this.symlinkPaths.has(relativePath)) return { kind: "symlink" };
    const result = await this.api.request(
      {
        path: `projects/${encodeProjectIdentity(this.target.sourceProjectId)}/repository/files/${encodeProjectIdentity(relativePath)}`,
        query: { ref: this.target.headSha }
      },
      GitLabFile
    );
    if (result.kind !== "ok") {
      this.note(
        `${relativePath}: its content at ${this.target.headSha.slice(0, 12)} could not be read from ${this.target.sourceProjectPath} (${result.message}).`
      );
      return { kind: "unavailable", reason: result.message };
    }
    const file = result.value;
    if (file.content === null) return null;
    if (file.encoding !== "base64") {
      this.note(`${relativePath}: GitLab returned it with an unexpected encoding, so it was not mirrored.`);
      return { kind: "unavailable", reason: `unexpected encoding "${file.encoding ?? "none"}"` };
    }
    const bytes = Buffer.from(file.content, "base64");
    if (bytes.length > MAX_SNAPSHOT_FILE_BYTES) return { kind: "too-large", bytes: bytes.length };
    if (await isBinaryContent(bytes)) return { kind: "binary" };
    return { kind: "text", text: bytes.toString("utf8") };
  }
  async list(directoryName) {
    if (!this.includeSiblings) return [];
    const cached = this.trees.get(directoryName);
    if (cached !== void 0) return cached;
    const collected = await this.api.collect(
      {
        path: `projects/${encodeProjectIdentity(this.target.sourceProjectId)}/repository/tree`,
        query: { ref: this.target.headSha, ...directoryName === "" ? {} : { path: directoryName } }
      },
      GitLabTreeEntry
    );
    if (collected.kind !== "ok") {
      this.note(
        `${directoryName === "" ? "(repository root)" : directoryName}: its file listing could not be read, so unchanged files beside the change were not available as context.`
      );
      this.trees.set(directoryName, []);
      return [];
    }
    const names = collected.value.items.filter((entry) => entry.type === "blob" && entry.mode !== SYMLINK_MODE).map((entry) => entry.path);
    this.trees.set(directoryName, names);
    return names;
  }
};
function mergeRequestPath(projectId, iid) {
  return `projects/${encodeProjectIdentity(projectId)}/merge_requests/${iid}`;
}
function modeKind(mode) {
  if (mode === null || mode === "" || mode === "0") return "unknown";
  if (mode === SYMLINK_MODE) return "symlink";
  if (mode === GITLINK_MODE) return "gitlink";
  return "file";
}
function toFetchedFile(entry) {
  const oldPath = entry.new_file ? null : entry.old_path;
  const newPath = entry.deleted_file ? null : entry.new_path;
  const oldKind = modeKind(entry.a_mode);
  const newKind = modeKind(entry.b_mode);
  const typeChanged = !entry.new_file && !entry.deleted_file && oldKind !== "unknown" && newKind !== "unknown" && oldKind !== newKind;
  const symlink = newKind === "symlink" || entry.deleted_file && oldKind === "symlink";
  const changeKind = entry.new_file ? "added" : entry.deleted_file ? "deleted" : typeChanged ? "type-changed" : entry.renamed_file ? "renamed" : "modified";
  const body = entry.diff;
  const binary = /^Binary files .* differ$/m.test(body) || /^GIT binary patch$/m.test(body);
  const modeOnly = entry.a_mode !== entry.b_mode && entry.a_mode !== null && entry.b_mode !== null;
  const contentlessIsExpected = entry.renamed_file || modeOnly || symlink || entry.generated_file === true;
  const incompleteReason = entry.too_large === true ? "GitLab marked it too large" : entry.collapsed === true ? "GitLab collapsed it" : body === "" && !binary && !contentlessIsExpected ? "GitLab returned an empty diff body" : null;
  const incomplete = incompleteReason !== null;
  const header = [
    `diff --git a/${entry.old_path} b/${entry.new_path}`,
    ...entry.a_mode === null || entry.b_mode === null || entry.a_mode === entry.b_mode ? [] : [`old mode ${entry.a_mode}`, `new mode ${entry.b_mode}`],
    `--- ${oldPath === null ? "/dev/null" : `a/${entry.old_path}`}`,
    `+++ ${newPath === null ? "/dev/null" : `b/${entry.new_path}`}`
  ].join("\n");
  const section = incomplete ? `${header}
` : `${header}
${body.endsWith("\n") || body === "" ? body : `${body}
`}`;
  return {
    oldPath,
    newPath,
    changeKind,
    binary,
    oldMode: entry.a_mode,
    newMode: entry.b_mode,
    symlink,
    incomplete,
    incompleteReason,
    patchSection: section
  };
}
function toRemoteDiscussion(discussion) {
  const notes = discussion.notes.map((note) => ({
    id: note.id,
    discussionId: discussion.id,
    author: note.author?.username ?? note.author?.name ?? "",
    body: note.body,
    url: null,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    resolved: note.resolved,
    resolvable: note.resolvable,
    system: note.system,
    position: note.position === null || note.position.base_sha === null || note.position.start_sha === null || note.position.head_sha === null ? null : {
      baseSha: note.position.base_sha,
      startSha: note.position.start_sha,
      headSha: note.position.head_sha,
      oldPath: note.position.old_path,
      newPath: note.position.new_path,
      oldLine: note.position.old_line,
      newLine: note.position.new_line
    }
  }));
  const resolvable = notes.filter((note) => note.resolvable);
  return {
    id: discussion.id,
    resolved: resolvable.length > 0 && resolvable.every((note) => note.resolved === true),
    notes
  };
}

// src/providers/registry.ts
var ProviderRegistry = class {
  providers;
  constructor(providers) {
    this.providers = providers;
  }
  byId(id) {
    const found = this.providers.find((provider) => provider.id === id);
    if (found === void 0) {
      throw new AmbicodeError("unknown-provider", `No provider "${id}" is registered.`);
    }
    return found;
  }
  forUrl(url) {
    const found = this.providers.find((provider) => provider.owns(url));
    if (found === void 0) {
      throw new AmbicodeError(
        "unsupported-target",
        "No AMBICODE provider recognizes that merge request URL.",
        {
          field: "--mr",
          details: [
            `Registered providers: ${this.providers.map((provider) => provider.id).join(", ")}.`,
            "Pass a full GitLab merge request URL, for example https://gitlab.example.com/group/project/-/merge_requests/42."
          ]
        }
      );
    }
    return found;
  }
  ids() {
    return this.providers.map((provider) => provider.id);
  }
};

// src/policy/resolve.ts
function resolvePolicy(options) {
  const { activity, project, packs } = options;
  const diagnostics = [...options.diagnostics ?? []];
  const projectRoot = normalizeRelative(project.root);
  const pathsSupplied = options.paths.length > 0;
  const projectRelativePaths = options.paths.map((value) => toProjectRelative(projectRoot, value)).filter((value) => value !== null);
  if (pathsSupplied && projectRelativePaths.length === 0) {
    return {
      activity,
      projectId: project.id,
      packs: [],
      rules: [],
      prompts: [],
      commandDecisions: [],
      diagnostics: [
        ...diagnostics,
        {
          severity: "notice",
          code: "paths-outside-project",
          message: `None of the supplied paths are inside project "${project.id}" (root "${project.root}"), so no policy from it applies.`
        }
      ]
    };
  }
  const packEntries = [];
  const rules = [];
  const prompts = [];
  const decisionsByCommand = /* @__PURE__ */ new Map();
  const consideredFilePaths = new Set(packs.map((loaded) => loaded.filePath));
  const applicableFilePaths = /* @__PURE__ */ new Set();
  for (const loaded of packs) {
    const pack = loaded.pack;
    if (!pack.activities.includes(activity)) continue;
    const matchedPaths = pathsSupplied ? projectRelativePaths.filter((value) => matchesAnyGlob(value, pack.appliesTo)) : [];
    if (pathsSupplied && matchedPaths.length === 0) continue;
    applicableFilePaths.add(loaded.filePath);
    packEntries.push({
      id: pack.id,
      reference: loaded.reference,
      origin: loaded.origin,
      authority: pack.authority,
      sourceLocation: pack.source.location,
      ...pack.source.externalVersion === void 0 ? {} : { sourceExternalVersion: pack.source.externalVersion },
      contentHash: loaded.contentHash,
      ...loaded.replacedReference === void 0 ? {} : { replacedReference: loaded.replacedReference },
      matchedPaths
    });
    for (const rule of pack.rules) {
      rules.push({
        qualifiedId: `${pack.id}/${rule.id}`,
        packId: pack.id,
        packReference: loaded.reference,
        authority: pack.authority,
        sourceLocation: pack.source.location,
        ...pack.source.externalVersion === void 0 ? {} : { sourceExternalVersion: pack.source.externalVersion },
        category: rule.category,
        instruction: rule.instruction,
        check: rule.check,
        remindOnEdit: rule.remindOnEdit
      });
    }
    prompts.push(...loaded.resolvedPrompts);
    for (const decision of pack.commandPolicy) {
      const existing = decisionsByCommand.get(decision.command);
      const source = {
        packId: pack.id,
        packReference: loaded.reference,
        action: decision.action,
        ...decision.reason === void 0 ? {} : { reason: decision.reason }
      };
      if (existing === void 0) {
        decisionsByCommand.set(decision.command, {
          command: decision.command,
          action: decision.action,
          sources: [source]
        });
      } else {
        existing.sources.push(source);
        existing.action = strongerAction(existing.action, decision.action);
      }
    }
  }
  packEntries.sort((a2, b) => a2.id.localeCompare(b.id));
  rules.sort((a2, b) => a2.qualifiedId.localeCompare(b.qualifiedId));
  prompts.sort(
    (a2, b) => a2.stage.localeCompare(b.stage) || a2.packId.localeCompare(b.packId) || a2.declaredPath.localeCompare(b.declaredPath)
  );
  const commandDecisions = [...decisionsByCommand.values()].sort(
    (a2, b) => a2.command.localeCompare(b.command)
  );
  for (const decision of commandDecisions) {
    decision.sources.sort((a2, b) => a2.packId.localeCompare(b.packId));
  }
  return {
    activity,
    projectId: project.id,
    packs: packEntries,
    rules: dedupeBy(rules, (rule) => rule.qualifiedId),
    prompts: dedupeBy(prompts, (prompt) => `${prompt.stage}::${prompt.absolutePath}`),
    commandDecisions,
    diagnostics: scopeDiagnostics(diagnostics, consideredFilePaths, applicableFilePaths)
  };
}
var PACK_SCOPED_DIAGNOSTIC_CODES = /* @__PURE__ */ new Set([
  "pack-unknown-command",
  "prompt-unreadable",
  "path-escape",
  "path-missing",
  "remind-on-edit-broad-pack"
]);
function scopeDiagnostics(diagnostics, consideredFilePaths, applicableFilePaths) {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.severity !== "error") return diagnostic;
    if (!PACK_SCOPED_DIAGNOSTIC_CODES.has(diagnostic.code)) return diagnostic;
    if (diagnostic.where === void 0) return diagnostic;
    const parsedSuccessfully = consideredFilePaths.has(diagnostic.where);
    const applicable = applicableFilePaths.has(diagnostic.where);
    if (parsedSuccessfully && !applicable) {
      return { ...diagnostic, severity: "notice" };
    }
    return diagnostic;
  });
}
var PREPARE_PROMPT_STAGES = {
  investigate: ["before-work", "before-report"],
  plan: ["before-work", "before-report"],
  task: ["before-work", "before-checks", "before-report"]
};
function applicablePrepareStages(activity) {
  return PREPARE_PROMPT_STAGES[activity] ?? [];
}
function strongerAction(a2, b) {
  return COMMAND_ACTION_PRECEDENCE[a2] >= COMMAND_ACTION_PRECEDENCE[b] ? a2 : b;
}
function decisionFor(policy, commandId) {
  const decision = policy.commandDecisions.find((candidate) => candidate.command === commandId);
  return decision === void 0 ? { action: "undeclared", sources: [] } : { action: decision.action, sources: decision.sources };
}
function explainRefusal(policy, commandId) {
  const { action, sources } = decisionFor(policy, commandId);
  if (action === "forbid") {
    const forbidding = sources.filter((source) => source.action === "forbid");
    const reasons = forbidding.map((source) => `${source.packReference}${source.reason === void 0 ? "" : `: ${source.reason}`}`).join("; ");
    return `Command "${commandId}" is forbidden by ${reasons}. Change that pack's commandPolicy deliberately if this is no longer the project's policy.`;
  }
  if (action === "propose") {
    return `Command "${commandId}" is proposed, not run automatically. Approve this specific run, or change the owning pack's commandPolicy.`;
  }
  return `Command "${commandId}" is not declared by any enabled pack for this activity, so AMBICODE does not run it. Add a "run" decision to a pack that applies here.`;
}
function dedupeBy(items, key) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    const identity3 = key(item);
    if (seen.has(identity3)) continue;
    seen.add(identity3);
    result.push(item);
  }
  return result;
}

// src/util/plugin-root.ts
import path13 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
async function resolvePluginRoot(fs2, env) {
  const declared = env["CLAUDE_PLUGIN_ROOT"];
  if (declared !== void 0 && declared.trim() !== "") return path13.resolve(declared);
  let directory = path13.dirname(fileURLToPath3(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (await fs2.exists(path13.join(directory, ".claude-plugin", "plugin.json"))) return directory;
    const parent = path13.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new AmbicodeError(
    "plugin-root-unresolved",
    "Could not locate the AMBICODE plugin directory.",
    { details: ["Set CLAUDE_PLUGIN_ROOT, or run the helper from inside the installed plugin."] }
  );
}
function builtinPoliciesDirectory(pluginRoot) {
  return path13.join(pluginRoot, "policies");
}
function promptsDirectory(pluginRoot) {
  return path13.join(pluginRoot, "prompts");
}

// src/composition/root.ts
async function createRuntime(overrides = {}) {
  const fs2 = overrides.fs ?? nodeFileSystem;
  const env = overrides.env ?? process.env;
  const runner = overrides.runner ?? new NodeProcessRunner(env);
  const cwd = overrides.cwd ?? process.cwd();
  return {
    runner,
    fs: fs2,
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? systemIds,
    cwd,
    pluginRoot: overrides.pluginRoot ?? await resolvePluginRoot(fs2, env),
    stdin: overrides.stdin ?? processStandardInput,
    env,
    providers: overrides.providers ?? defaultProviders(runner, cwd)
  };
}
function defaultProviders(runner, cwd) {
  return new ProviderRegistry([new GitLabProvider({ runner, cwd }), new GitHubProvider()]);
}
async function openRepository(runtime) {
  const probe = new Git({ runner: runtime.runner, repositoryRoot: runtime.cwd });
  if (!await probe.isRepository()) {
    throw new AmbicodeError("not-a-repository", "This directory is not inside a git work tree.", {
      details: ["Run AMBICODE from inside the repository you want to review."]
    });
  }
  const repositoryRoot = await probe.topLevel();
  return { git: new Git({ runner: runtime.runner, repositoryRoot }), repositoryRoot };
}
async function openWorkspace(runtime) {
  const { git, repositoryRoot } = await openRepository(runtime);
  const loaded = await loadConfig(runtime.fs, repositoryRoot);
  return { runtime, git, repositoryRoot, config: loaded.config, configPath: loaded.filePath };
}
function projectForPath(config, repositoryRelativePath) {
  return mostSpecificRoot(config.projects, repositoryRelativePath);
}
function projectById(config, id) {
  const project = config.projects.find((candidate) => candidate.id === id);
  if (project === void 0) {
    throw new AmbicodeError("unknown-project", `No project "${id}" is configured.`, {
      field: "projects",
      details: [`Configured projects: ${config.projects.map((candidate) => candidate.id).join(", ")}.`]
    });
  }
  return project;
}
function projectForRequest(config, requestedId, paths) {
  if (requestedId !== null) return projectById(config, requestedId);
  if (config.projects.length === 0) {
    throw new AmbicodeError("unknown-project", "No project is configured for this repository.", {
      details: ["Run the AMBICODE init skill first."]
    });
  }
  if (config.projects.length === 1) return config.projects[0];
  if (paths.length > 0) {
    const resolved = new Set(paths.map((value) => projectForPath(config, value)?.id ?? null));
    if (resolved.size === 1) {
      const [only] = resolved;
      if (only !== null && only !== void 0) return projectById(config, only);
    }
  }
  throw new AmbicodeError(
    "ambiguous-project",
    "This repository configures more than one project, and this request does not identify exactly one.",
    {
      field: "--project",
      details: [
        `Configured projects: ${config.projects.map((project) => project.id).join(", ")}.`,
        "Pass --project <id>, or give one or more paths that all fall inside a single project root."
      ]
    }
  );
}
async function resolvePolicyFor(options) {
  const loaded = await loadPacksForProject({
    fs: options.workspace.runtime.fs,
    project: options.project,
    builtinDirectory: builtinPoliciesDirectory(options.workspace.runtime.pluginRoot),
    repositoryRoot: options.workspace.repositoryRoot
  });
  return resolvePolicy({
    activity: options.activity,
    project: options.project,
    packs: loaded.packs,
    paths: options.paths,
    diagnostics: loaded.diagnostics
  });
}
async function toRepositoryRelative(workspace, value) {
  const absolute = path14.isAbsolute(value) ? value : path14.resolve(workspace.runtime.cwd, value);
  const resolved = await realpathIfExists(workspace.runtime.fs, absolute);
  return normalizeRelative(path14.relative(workspace.repositoryRoot, resolved));
}
async function realpathIfExists(fs2, absolute) {
  try {
    return await fs2.realpath(absolute);
  } catch {
    return absolute;
  }
}

export {
  contentHash,
  readPackText,
  validatePack,
  validatePackSet,
  loadPacksForProject,
  RemoteTarget,
  RemotePosition,
  samePosition,
  RemoteDiscussion,
  revisionMatches,
  ReviewCoverage,
  COMPLETE_COVERAGE,
  isUselessAsContext,
  pathExclusionReason,
  isBinaryContent,
  describeExclusion,
  isExcludedFromReview,
  combineDiff,
  addressableLines,
  lineAt,
  totalChangedLines,
  positionForLocation,
  applicablePrepareStages,
  decisionFor,
  explainRefusal,
  builtinPoliciesDirectory,
  promptsDirectory,
  createRuntime,
  openRepository,
  openWorkspace,
  projectForPath,
  projectById,
  projectForRequest,
  resolvePolicyFor,
  toRepositoryRelative
};
