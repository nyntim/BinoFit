// Jest runs CommonJS without --experimental-vm-modules, so a native `import()` throws.
// Metro handles it in the app; in tests rewrite `import(x)` to `Promise.resolve().then(() => require(x))`.
module.exports = function dynamicImportToRequire({ types: t }) {
  return {
    name: 'dynamic-import-to-require',
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== 'Import') return;
        const [arg] = path.node.arguments;
        const requireCall = t.callExpression(t.identifier('require'), [arg]);
        path.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), []),
              t.identifier('then')
            ),
            [t.arrowFunctionExpression([], requireCall)]
          )
        );
      },
    },
  };
};
