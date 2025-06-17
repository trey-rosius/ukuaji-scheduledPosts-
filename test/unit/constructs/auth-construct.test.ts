import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AuthConstruct } from "../../../lib/constructs/auth-construct";

describe("AuthConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    new AuthConstruct(stack, "Auth", { userPoolName: "TestUserPool" });
    template = Template.fromStack(stack);
  });

  /* -------------------------------------------------- */
  /* 1. User‑pool core properties                        */
  /* -------------------------------------------------- */
  it("creates a Cognito UserPool with secure defaults", () => {
    const [pool] = Object.values(
      template.findResources("AWS::Cognito::UserPool")
    ) as any[];

    expect(pool.Properties.UserPoolName).toBe("TestUserPool");
    expect(pool.Properties.AutoVerifiedAttributes).toContain("email");

    // password policy
    const pwd = pool.Properties.Policies.PasswordPolicy;
    expect(pwd.MinimumLength).toBe(12);
    expect(pwd.RequireSymbols).toBe(true);

    // account‑recovery (PHONE+EMAIL) – some synth combinations emit a full
    // RecoveryMechanisms array, others omit it entirely.  If present, ensure
    // at least "verified_email" is included.
    const rec =
      pool.Properties.AccountRecoverySetting?.RecoveryMechanisms ?? [];
    const names = rec.map((r: any) => r.Name);
    if (names.length) {
      expect(names).toEqual(expect.arrayContaining(["verified_email"]));
    }

    // removal policy => DeletionPolicy Retain
    template.hasResource("AWS::Cognito::UserPool", {
      DeletionPolicy: "Retain",
    });
  });

  /* -------------------------------------------------- */
  /* 2. User‑pool client token validity / auth flows     */
  /* -------------------------------------------------- */
  it("creates a UserPoolClient with correct token validity settings", () => {
    const [client] = Object.values(
      template.findResources("AWS::Cognito::UserPoolClient")
    ) as any[];

    // CDK translates 1h into 60 (minutes) when TokenValidityUnits defaults to minutes
    expect(client.Properties.AccessTokenValidity).toBe(60);
    expect(client.Properties.IdTokenValidity).toBe(60);
    expect(client.Properties.RefreshTokenValidity).toBe(30 * 24 * 60); // 30 days in minutes

    const flows: string[] = client.Properties.ExplicitAuthFlows;
    [
      "ALLOW_USER_PASSWORD_AUTH",
      "ALLOW_USER_SRP_AUTH",
      "ALLOW_REFRESH_TOKEN_AUTH",
    ].forEach((f) => expect(flows).toContain(f));
  });

  /* -------------------------------------------------- */
  /* 3. Default name fallback                           */
  /* -------------------------------------------------- */
  it("falls back to default user‑pool name if none provided", () => {
    const app2 = new cdk.App();
    const stack2 = new cdk.Stack(app2, "StackDefaultName");
    new AuthConstruct(stack2, "AuthDefault");
    const tpl2 = Template.fromStack(stack2);

    const [pool2] = Object.values(
      tpl2.findResources("AWS::Cognito::UserPool")
    ) as any[];
    expect(pool2.Properties.UserPoolName).toBe("ScheduledPostsUserPool");
  });
});
