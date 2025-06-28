import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as waf from "aws-cdk-lib/aws-wafv2";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { COMMON_TAGS } from "../constants";

/**
 * Properties for the WafConstruct
 */
export interface WafConstructProps {
  /**
   * The AppSync GraphQL API to protect
   */
  api: appsync.GraphqlApi;

  /**
   * The name of the WAF WebACL
   * @default "GraphQLApiProtection"
   */
  webAclName?: string;

  /**
   * The rate limit for requests per 5-minute window
   * @default 1000
   */
  rateLimit?: number;

  /**
   * Whether to enable AWS managed rule sets
   * @default true
   */
  enableManagedRules?: boolean;
}

/**
 * Construct for AWS WAF protection of AppSync GraphQL API
 * Implements security best practices according to the AWS Well-Architected Framework
 */
export class WafConstruct extends Construct {
  /**
   * The WAF WebACL
   */
  public readonly webAcl: waf.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafConstructProps) {
    super(scope, id);

    const {
      api,
      webAclName = "GraphQLApiProtection",
      rateLimit = 1000,
      enableManagedRules = true,
    } = props;

    // Create rules for the WebACL
    const rules: waf.CfnWebACL.RuleProperty[] = [];

    // Rule #1: AWS Managed Rules for Common Vulnerabilities
    if (enableManagedRules) {
      // Core rule set - protects against common vulnerabilities (SQLi, XSS, etc.)
      rules.push({
        name: "AWS-AWSManagedRulesCommonRuleSet",
        priority: 10,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
            excludedRules: [{ name: "SizeRestrictions_BODY" }],
          },
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesCommonRuleSet",
        },
      });

      // Known bad inputs rule set - protects against known malicious inputs
      rules.push({
        name: "AWS-AWSManagedRulesKnownBadInputsRuleSet",
        priority: 20,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesKnownBadInputsRuleSet",
        },
      });

      // SQL injection rule set - specific protection against SQL injection
      rules.push({
        name: "AWS-AWSManagedRulesSQLiRuleSet",
        priority: 30,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesSQLiRuleSet",
          },
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesSQLiRuleSet",
        },
      });
    }

    // Rule #2: Rate-based rule to prevent DoS attacks
    rules.push({
      name: "RateLimitRule",
      priority: 40,
      statement: {
        rateBasedStatement: {
          limit: rateLimit,
          aggregateKeyType: "IP",
        },
      },
      action: {
        block: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "RateLimitRule",
      },
    });

    // Rule #3: Size constraint rule to prevent large GraphQL queries
    rules.push({
      name: "GraphQLSizeConstraint",
      priority: 50,
      statement: {
        sizeConstraintStatement: {
          fieldToMatch: { body: {} },

          comparisonOperator: "GT",
          size: 8000, // 8KB max request size
          textTransformations: [
            {
              priority: 0,
              type: "NONE",
            },
          ],
        },
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "GraphQLSizeConstraint",
      },
    });

    // Only add the GraphQLQueryDepthLimit rule if managed rules are enabled
    if (enableManagedRules) {
      // Rule #4: Custom rule to block requests with excessive query depth
      // This is implemented as a regex pattern match rule that looks for many nested curly braces
      // which is a simple heuristic for detecting deeply nested GraphQL queries
      rules.push({
        name: "GraphQLQueryDepthLimit",
        priority: 60,
        statement: {
          regexPatternSetReferenceStatement: {
            arn: new waf.CfnRegexPatternSet(this, "NestedQueryPatterns", {
              regularExpressionList: [
                // Pattern to detect deeply nested queries (more than 7 levels deep)
                "\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{[^\\{\\}]*\\{",
              ],
              scope: "REGIONAL",
            }).attrArn,
            fieldToMatch: {
              body: {},
            },
            textTransformations: [
              {
                priority: 0,
                type: "NONE",
              },
            ],
          },
        },
        action: {
          block: {},
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "GraphQLQueryDepthLimit",
        },
      });
    }

    // Create the WebACL
    this.webAcl = new waf.CfnWebACL(this, "WebAcl", {
      name: webAclName,
      defaultAction: {
        allow: {},
      },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: webAclName,
        sampledRequestsEnabled: true,
      },
      rules,
    });

    // Associate the WebACL with the AppSync API
    new waf.CfnWebACLAssociation(this, "WebAclAssociation", {
      resourceArn: `arn:aws:appsync:${cdk.Stack.of(this).region}:${
        cdk.Stack.of(this).account
      }:apis/${api.apiId}`,
      webAclArn: this.webAcl.attrArn,
    });

    // Apply common tags
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
