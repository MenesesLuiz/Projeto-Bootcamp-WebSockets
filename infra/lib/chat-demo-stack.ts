import { join } from "path";
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

/**
 * The simplest possible host for a one-day, <=50-person workshop demo: a
 * single EC2 instance running the app's Docker image (api + built web, see
 * ../../Dockerfile) directly - no ALB, no CloudFront, no S3. Plain HTTP on
 * the instance's own public DNS name, on purpose: there's no domain to
 * attach a TLS certificate to, and serving everything from one HTTP origin
 * means the browser never hits the "https page can't open ws://" wall.
 *
 * Meant to go up the day of the workshop and come back down right after
 * (`cdk destroy`) - see docs/deploy.md for the full run book.
 */
export class ChatDemoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // A minimal, self-contained VPC (1 AZ, 1 public subnet, no NAT gateway -
    // nothing to route private traffic through, so nothing to pay for)
    // instead of `Vpc.fromLookup({ isDefault: true })`: not every account
    // has a default VPC, and creating one just for this would be a
    // permanent change to the account for what's meant to be a one-day,
    // fully torn-down-after deploy.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });

    const image = new DockerImageAsset(this, "AppImage", {
      // The Dockerfile (and its build context: api/ + web/) lives at the
      // workshop root, two levels above this file.
      directory: join(__dirname, "../.."),
      platform: Platform.LINUX_AMD64,
    });

    const securityGroup = new ec2.SecurityGroup(this, "AppSecurityGroup", {
      vpc,
      description: "Realtime chat demo - HTTP only, open to the room",
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Chat app (HTTP + WebSocket upgrade)");

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // Lets the instructor open a shell via SSM Session Manager if
        // something goes wrong live - no SSH key pair, no port 22 open.
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });
    image.repository.grantPull(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "dnf install -y docker",
      "systemctl enable --now docker",
      // The instance's own public DNS isn't known until it boots, so it's
      // discovered here (via IMDSv2) instead of injected from CDK - that
      // would be a circular reference (the instance pointing at its own
      // not-yet-created attribute).
      "TOKEN=$(curl -Ss -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')",
      "PUBLIC_DNS=$(curl -Ss -H \"X-aws-ec2-metadata-token: $TOKEN\" http://169.254.169.254/latest/meta-data/public-hostname)",
      `aws ecr get-login-password --region ${this.region} | docker login --username AWS --password-stdin ${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      `docker run -d --name chat --restart unless-stopped -p 80:3000 -e CORS_ORIGIN="http://$PUBLIC_DNS" ${image.imageUri}`,
    );

    const instance = new ec2.Instance(this, "AppInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup,
      role,
      userData,
      // Redeploying with a changed userData script (e.g. while testing
      // before the workshop) replaces the instance instead of leaving a
      // stale script that already ran once and won't run again.
      userDataCausesReplacement: true,
    });

    new CfnOutput(this, "ChatUrl", {
      value: `http://${instance.instancePublicDnsName}`,
      description: "Share this URL with the room",
    });
  }
}
