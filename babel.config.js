module.exports = {
  comments: false,
  env: {
    main: {
      presets: [
        [
          "@babel/preset-env", {
            bugfixes: true,
            targets: { node: 16 },
            useBuiltIns: "usage",
            corejs: 3,
          },
        ],
      ],
    },
  },
  plugins: [
    "@babel/plugin-transform-runtime",
    "@babel/plugin-transform-optional-chaining",
    "@babel/plugin-transform-nullish-coalescing-operator",
  ],
};
