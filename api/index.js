const serverless = require("serverless-http");
const app = require("./notices");

module.exports = app;
module.exports.handler = serverless(app);
