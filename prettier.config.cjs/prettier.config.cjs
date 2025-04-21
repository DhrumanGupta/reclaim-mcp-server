/** @type {import("prettier").Config} */
module.exports = {
  printWidth: 100, // Fit more code, good for nested structures
  tabWidth: 2, // Standard tab width
  useTabs: false, // Use spaces, not tabs
  semi: true, // Always add semicolons
  singleQuote: false, // Use double quotes for strings
  jsxSingleQuote: false, // Use double quotes in JSX
  quoteProps: "consistent", // Only add quotes around object properties if needed, be consistent
  trailingComma: "all", // Add trailing commas everywhere possible (git diffs!)
  bracketSpacing: true, // Add spaces inside object literals { foo: bar }
  bracketSameLine: false, // Put > of multi-line HTML elements on new line
  arrowParens: "always", // Always include parens around arrow function parameters (consistency)
  endOfLine: "lf", // Use Unix line endings
};
