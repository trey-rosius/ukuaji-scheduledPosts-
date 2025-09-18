"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tracer = exports.metrics = exports.logger = void 0;
const logger_1 = require("@aws-lambda-powertools/logger");
const metrics_1 = require("@aws-lambda-powertools/metrics");
const tracer_1 = require("@aws-lambda-powertools/tracer");
const logger = new logger_1.Logger({
  persistentKeys: {
    aws_account_id: process.env.AWS_ACCOUNT_ID || "N/A",
    aws_region: process.env.AWS_REGION || "N/A",
  },
});
exports.logger = logger;
const metrics = new metrics_1.Metrics({
  defaultDimensions: {
    aws_account_id: process.env.AWS_ACCOUNT_ID || "N/A",
    aws_region: process.env.AWS_REGION || "N/A",
  },
});
exports.metrics = metrics;
const tracer = new tracer_1.Tracer();
exports.tracer = tracer;
