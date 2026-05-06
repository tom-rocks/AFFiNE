/** @type {import('.')} */
// twine: Twine ships only the linux/amd64 server image to Railway, so we
// only need the x64 binding. Hardcoding the static require()s for arm64
// and armv7 (the upstream multi-arch pattern) made rspack's bundler fail
// at build time because those .node files don't exist when CI only
// produces server-native.x64.node.
let binding;
try {
  binding = require('./server-native.node');
} catch {
  binding = require('./server-native.x64.node');
}

module.exports = binding;
