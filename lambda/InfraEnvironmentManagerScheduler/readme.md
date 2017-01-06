# Environment Manager Scheduler

The scheduler is designed to run as a scheduled lambda function within an AWS account managed by Environment Manager. Its responsibility is to start and stop EC2 instances in the AWS account according to their schedule.

When Environment Manager attempts to determine the schedule for a particular instance it first checks to see if a schedule has been assigned directly to the instance. Instance specific schedules are stored within the schedule tag of that instance. If no instance specific schedule is found it will then check to see if the instance is part of an Auto Scaling Group (ASG) and inherit any schedule assigned to that ASG. ASG specific schedules are similarly stored in the schedule tag for that ASG. Finally if the instance is not a member of an ASG or the ASG has no schedule, the system will take the schedule for the Environment to which the Instance is a member. Environment schedules are stored within Environment Manager's database.

There are several reasons that the scheduler may not affect the EC2 instances within an account. It will not schedule instances which:

- Have not been assigned an valid Environment (via the environment tag)
- Are members of ASGs which contain instances in different lifecycle states.
- Are not currently in the stopped or running instance states.
- Are members of an ASG and not currently in the InService or Standby lifecycle states.
- Have, or inherit, a schedule whose value is 'NOSCHEDULE'
- Have, or inherit, an invalid schedule
- Have, or inherit, a schedule which has not yet begun (future schedules)

## Building and Deploying

```
cd ./lambda/scheduler
npm install
```

### Running the tests

```
npm test
```

### Running locally

There are two ways you can run this lambda locally.

- First, you can use [lambda-local](https://www.npmjs.com/package/lambda-local) which will execute index.handler in the same way that AWS does.
- Second you can run ``` node local ``` in your command prompt. This will execute ./local/index.js which will run the scheduler manually.

In both cases an AWS access key and secret key must be provided in one of the default locations (such as environment variables) in order to access your AWS account.

### Configuration

The root of the project must contain a config.json file which contains the settings necessary to run the application. A sample config file is included at ./local/config.json and can be modified with the necessary settings to run the function locally.

```
{
  "limitToEnvironment": "xxx",
  "whatIf": true,
  "listSkippedInstances": true,
  "ignoreASGInstances": false,
  "em": {
    "host": "environment-manager-domain-name",
    "credentials": {
      "username": "username",
      "password": "password"
    }
  },
  "aws": {
    "region": "eu-west-1"
  }
}
```

- **limitToEnvironment**: An optional regular expression which, if provided, will cause the scheduler to limit processing to those instances with a matching 'environment' tag.
- **ignoreASGInstances**: If set to true this flag will prevent destructive operations on instances inside ASGs. These instances will not be listed in the output.
- **whatIf**: If set to true this flag will prevent all destructive operations from running. Successful responses will be simulated.
- **em**: The hostname (or IP) and credentials needed to access the Environment Manager service which governs this AWS account.
- **aws**: Configuration information provided to the AWS SDK when constructing the EC2 service.

### Packaging and Deployment

In order to execute this lambda in AWS all files must be added to a .zip package along with a suitable config.json file in the root.

Exceptions include:

- ./local
- ./\*\*/\*.spec.js
- Any dev specific module dependencies (currently just mocha and chai)

The package can then be uploaded to an AWS lambda function.

### IAM permissions

The role under which the Lambda is configured to run must have the permissions found in the following sample policy:

```
{
  "Version" : "2012-10-17",
  "Statement" : [
    {
      "Effect" : "Allow",
      "Action" : [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "autoscaling:EnterStandby",
        "autoscaling:ExitStandby"
      ],
      "Resource" : [
          "*"
      ]
    }
  ]
}
```

## Monitoring

The lambda function will exit with an error if there are any issues modifying the state of instances. CloudWatch logs will describe the specific activity that failed.