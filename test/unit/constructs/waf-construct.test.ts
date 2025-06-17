import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { WafConstruct } from "../../../lib/constructs/waf-construct";
import { createMockAppSyncApi } from "../../utils/test-utils";

describe("WafConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    new WafConstruct(stack, "WAF", {
      api: createMockAppSyncApi(stack, "MockApi"),
      webAclName: "TestWebAcl",
      rateLimit: 500,
      enableManagedRules: true,
    });

    template = Template.fromStack(stack);
  });

  /* -------------------------------------------------- */
  /* 1. WebACL basics                                   */
  /* -------------------------------------------------- */
  it("creates a WAF WebACL with default‑allow and metric name", () => {
    const [acl] = Object.values(
      template.findResources("AWS::WAFv2::WebACL")
    ) as any[];
    expect(acl.Properties.Name).toBe("TestWebAcl");
    expect(acl.Properties.DefaultAction).toEqual({ Allow: {} });
    expect(acl.Properties.VisibilityConfig.MetricName).toBe("TestWebAcl");
  });

  /* -------------------------------------------------- */
  /* 2. Rate‑limit rule and managed rules               */
  /* -------------------------------------------------- */
  it("contains managed rule groups and rate‑limit rule", () => {
    const [acl] = Object.values(
      template.findResources("AWS::WAFv2::WebACL")
    ) as any[];
    const ruleNames = (acl.Properties.Rules || []).map((r: any) => r.Name);

    [
      "AWS-AWSManagedRulesCommonRuleSet",
      "AWS-AWSManagedRulesKnownBadInputsRuleSet",
      "AWS-AWSManagedRulesSQLiRuleSet",
      "RateLimitRule",
      "GraphQLSizeConstraint",
    ].forEach((name) => expect(ruleNames).toContain(name));

    // Check that the rate limit is set to 500
    const rateRule = (acl.Properties.Rules || []).find(
      (r: any) => r.Name === "RateLimitRule"
    );
    expect(rateRule.Statement.RateBasedStatement.Limit).toBe(500);
  });

  /* -------------------------------------------------- */
  /* 3. Regex pattern set for depth‑limit               */
  /* -------------------------------------------------- */
  it("creates nested‑query RegexPatternSet", () => {
    const regexSets = template.findResources("AWS::WAFv2::RegexPatternSet");
    expect(Object.keys(regexSets).length).toBe(1);
    const [set] = Object.values(regexSets) as any[];
    expect(set.Properties.RegularExpressionList[0]).toMatch(/\{[^\{\}]*\{/);
  });

  /* -------------------------------------------------- */
  /* 4. Association with AppSync API                    */
  /* -------------------------------------------------- */
  it("associates the WebACL with the AppSync API", () => {
    const assoc = Object.values(
      template.findResources("AWS::WAFv2::WebACLAssociation")
    )[0] as any;
    expect(JSON.stringify(assoc.Properties.ResourceArn)).toContain("apis/");

    const webAclArn = JSON.stringify(assoc.Properties.WebACLArn);
    expect(webAclArn).toContain("WebAcl");
  });

  /* -------------------------------------------------- */
  /* 5. Managed‑rules disabled path                     */
  /* -------------------------------------------------- */
  it("omits AWS managed rules when disabled", () => {
    const app2 = new cdk.App();
    const stack2 = new cdk.Stack(app2, "NoManagedRulesStack");
    new WafConstruct(stack2, "WAF2", {
      api: createMockAppSyncApi(stack2, "Api2"),
      enableManagedRules: false,
    });

    const tpl2 = Template.fromStack(stack2);
    const [acl2] = Object.values(
      tpl2.findResources("AWS::WAFv2::WebACL")
    ) as any[];
    const names2 = acl2.Properties.Rules.map((r: any) => r.Name);

    expect(names2).toContain("RateLimitRule");
    expect(names2).toContain("GraphQLSizeConstraint");
    expect(names2).not.toContain("AWS-AWSManagedRulesCommonRuleSet");
  });
});
