// Pure-TS unit tests (game logic + save). Run: npx jest
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: { "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"], babelrc: false, configFile: false }] },
  moduleNameMapper: { "\\.(png|jpg|wav|ttf)$": "<rootDir>/jest.assetStub.js", "^@/(.*)$": "<rootDir>/$1" },
  globals: { __DEV__: true },
};
