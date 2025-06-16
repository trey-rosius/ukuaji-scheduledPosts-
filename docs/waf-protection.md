# AWS WAF Protection for GraphQL API

This document outlines the AWS WAF (Web Application Firewall) protection
implemented for the AppSync GraphQL API in the Scheduled Posts application,
following the AWS Well-Architected Framework best practices.

## Overview

The implementation adds a WAF WebACL to protect the AppSync GraphQL API from
common web vulnerabilities and attacks. The WAF is configured with a set of
rules that follow security best practices and the AWS Well-Architected
Framework.

## Implementation Details

The WAF protection is implemented in the `WafConstruct` class, which creates a
WAF WebACL and associates it with the AppSync GraphQL API. The WebACL includes
the following rules:

### 1. AWS Managed Rule Sets

- **AWS Core Rule Set (CRS)**: Protects against common web vulnerabilities such
  as SQL injection, cross-site scripting (XSS), and other OWASP Top 10
  vulnerabilities.
- **Known Bad Inputs Rule Set**: Blocks requests with known malicious inputs.
- **SQL Injection Rule Set**: Provides enhanced protection against SQL injection
  attacks.

### 2. Rate-Based Protection

- Limits the number of requests from a single IP address to prevent DoS attacks.
- Default rate limit: 1500 requests per 5-minute window.

### 3. Size Constraint Rule

- Prevents large GraphQL queries that could be used for DoS attacks or to
  exploit resource limitations.
- Blocks requests with a body size larger than 8KB.

### 4. GraphQL-Specific Protection

- Blocks deeply nested GraphQL queries that could lead to performance issues or
  DoS attacks.
- Uses a regex pattern to detect queries with excessive nesting levels (more
  than 7 levels deep).

## Alignment with AWS Well-Architected Framework

### 1. Security Pillar

- **Implement a strong identity foundation**: The API already uses multiple
  authorization modes (API key, Cognito User Pool, IAM).
- **Enable traceability**: WAF logs are enabled for all rules, providing
  visibility into potential security events.
- **Apply security at all layers**: WAF adds a security layer at the API gateway
  level, complementing other security measures.
- **Automate security best practices**: Security rules are defined as code and
  automatically deployed with the application.
- **Protect data in transit and at rest**: WAF helps protect data in transit by
  preventing malicious requests.

### 2. Reliability Pillar

- **Test recovery procedures**: WAF helps prevent attacks that could affect
  system availability.
- **Automatically recover from failure**: Rate-limiting prevents resource
  exhaustion during traffic spikes or DoS attacks.
- **Scale horizontally to increase aggregate system availability**: WAF scales
  automatically with the API.
- **Stop guessing capacity**: WAF helps manage unexpected traffic patterns by
  blocking malicious requests.

### 3. Performance Efficiency Pillar

- **Democratize advanced technologies**: WAF is a managed service that provides
  advanced security without operational overhead.
- **Go global in minutes**: WAF is available globally and can protect APIs
  deployed in any region.
- **Use serverless architectures**: WAF is a serverless service that complements
  the serverless architecture of AppSync.

### 4. Cost Optimization Pillar

- **Adopt a consumption model**: WAF pricing is based on the number of rules and
  requests, aligning costs with usage.
- **Measure overall efficiency**: WAF metrics can help identify and address
  inefficient or malicious usage patterns.

### 5. Operational Excellence Pillar

- **Make frequent, small, reversible changes**: WAF rules can be updated
  independently of the application code.
- **Refine operations procedures frequently**: WAF logs and metrics provide
  insights for continuous improvement.
- **Anticipate failure**: WAF helps prevent and mitigate common attack vectors.

## Monitoring and Maintenance

- WAF generates CloudWatch metrics for each rule, allowing monitoring of blocked
  requests and potential attacks.
- The WebACL ID is exported as a CloudFormation output for easy reference.
- WAF logs can be analyzed to identify attack patterns and refine rules.

## Future Enhancements

Consider the following enhancements for production environments:

1. **Custom Rules**: Add custom rules based on specific application requirements
   and observed attack patterns.
2. **Geographic Restrictions**: Block or allow requests based on geographic
   location if the application has regional restrictions.
3. **Bot Control**: Add AWS Managed Rules for Bot Control to prevent automated
   scraping or abuse.
4. **Account Takeover Prevention**: Implement rules to detect and prevent
   account takeover attempts.
5. **Integration with AWS Security Hub**: For centralized security monitoring
   and compliance reporting.
