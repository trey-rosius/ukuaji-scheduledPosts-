# Testing

Once deployed , create a cognito user with the following command.

Make sure to replace the `user-pool-id` with the one generated when you deployed
the app.

```bash
aws cognito-idp admin-create-user \
  --region us-east-1 \
  --user-pool-id us-east-1_Wmtq2POvz \
  --username test@gmail.com \
  --temporary-password 'XXXXXX846#' \
  --message-action SUPPRESS \
  --user-attributes \
    Name="email",Value="test@gmail.com" \
    Name="email_verified",Value="true"

```

# RAG Pipeline

To populate the knowledge base with data, add Markdown or Video files to the
`uploads/` in this S3 bucket
`${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-media`.

Video files trigger a step functions workflow.
