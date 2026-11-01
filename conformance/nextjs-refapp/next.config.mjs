// The adapter packages run as plain Node modules rather than through the
// bundler, as they would from node_modules in an adopter's app.
export default {
  serverExternalPackages: ["@seamless-auth/nextjs", "@seamless-auth/core"],
};
