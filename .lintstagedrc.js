const path = require("path");

const buildNextEslintCommand = (filenames) =>
  `yarn workspace @ss/nextjs eslint --fix ${filenames
    .map((f) => path.relative(path.join("packages", "nextjs"), f))
    .join(" ")}`;

const checkTypesNextCommand = () => "yarn next:check-types";

const buildStylusEslintCommand = (filenames) =>
  `yarn stylus:lint --fix ${filenames
    .map((f) => path.relative(path.join("packages", "stylus"), f))
    .join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/stylus/**/*.{ts,tsx}": [buildStylusEslintCommand],
};
