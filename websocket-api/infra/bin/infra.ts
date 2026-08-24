#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { ChatDemoStack } from "../lib/chat-demo-stack";

const app = new App();

new ChatDemoStack(app, "RealtimeChatDemoStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
