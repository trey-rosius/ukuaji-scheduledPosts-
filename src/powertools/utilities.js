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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbGl0aWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXRpbGl0aWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDBEQUF1RDtBQUN2RCw0REFBeUQ7QUFDekQsMERBQXVEO0FBRXZELE1BQU0sTUFBTSxHQUFHLElBQUksZUFBTSxDQUFDO0lBQ3hCLGNBQWMsRUFBRTtRQUNkLGNBQWMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxLQUFLO1FBQ25ELFVBQVUsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxLQUFLO0tBQzVDO0NBQ0YsQ0FBQyxDQUFDO0FBVU0sd0JBQU07QUFSZixNQUFNLE9BQU8sR0FBRyxJQUFJLGlCQUFPLENBQUM7SUFDMUIsaUJBQWlCLEVBQUU7UUFDakIsY0FBYyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLEtBQUs7UUFDbkQsVUFBVSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLEtBQUs7S0FDNUM7Q0FDRixDQUFDLENBQUM7QUFHYywwQkFBTztBQUZ4QixNQUFNLE1BQU0sR0FBRyxJQUFJLGVBQU0sRUFBRSxDQUFDO0FBRUYsd0JBQU0iLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiQGF3cy1sYW1iZGEtcG93ZXJ0b29scy9sb2dnZXJcIjtcbmltcG9ydCB7IE1ldHJpY3MgfSBmcm9tIFwiQGF3cy1sYW1iZGEtcG93ZXJ0b29scy9tZXRyaWNzXCI7XG5pbXBvcnQgeyBUcmFjZXIgfSBmcm9tIFwiQGF3cy1sYW1iZGEtcG93ZXJ0b29scy90cmFjZXJcIjtcblxuY29uc3QgbG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gIHBlcnNpc3RlbnRLZXlzOiB7XG4gICAgYXdzX2FjY291bnRfaWQ6IHByb2Nlc3MuZW52LkFXU19BQ0NPVU5UX0lEIHx8IFwiTi9BXCIsXG4gICAgYXdzX3JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCBcIk4vQVwiLFxuICB9LFxufSk7XG5cbmNvbnN0IG1ldHJpY3MgPSBuZXcgTWV0cmljcyh7XG4gIGRlZmF1bHREaW1lbnNpb25zOiB7XG4gICAgYXdzX2FjY291bnRfaWQ6IHByb2Nlc3MuZW52LkFXU19BQ0NPVU5UX0lEIHx8IFwiTi9BXCIsXG4gICAgYXdzX3JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCBcIk4vQVwiLFxuICB9LFxufSk7XG5jb25zdCB0cmFjZXIgPSBuZXcgVHJhY2VyKCk7XG5cbmV4cG9ydCB7IGxvZ2dlciwgbWV0cmljcywgdHJhY2VyIH07XG4iXX0=