export default {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  clearMocks: true,
  moduleNameMapper: {
    "^@seamless-auth/core$": "<rootDir>/../core/dist/index.js",
    "^@seamless-auth/core/(.*)$": "<rootDir>/../core/dist/$1.js",
  },
};
