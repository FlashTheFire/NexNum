# AWS Deployment

AWS ECS/Fargate deployment for NexNum.

## Prerequisites

- AWS CLI configured
- Docker installed
- ECR repository created
- ECS cluster created
- Secrets Manager configured

## Quick Start

```bash
# Deploy to staging
./infra/aws/deploy.sh staging v1.0.0

# Deploy to production
./infra/aws/deploy.sh production v1.0.0
```

## Setup (First Time)

### 1. Create ECR Repository
```bash
aws ecr create-repository --repository-name nexnum-api --region us-east-1
```

### 2. Create Secrets
```bash
aws secretsmanager create-secret \
  --name nexnum/production \
  --secret-string '{
    "DATABASE_URL": "postgresql://...",
    "REDIS_URL": "redis://...",
    "JWT_SECRET": "..."
  }'
```

### 3. Create ECS Cluster
```bash
aws ecs create-cluster --cluster-name nexnum-production
```

### 4. Create Service
```bash
aws ecs create-service \
  --cluster nexnum-production \
  --service-name nexnum-api \
  --task-definition nexnum-api \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

## Files

| File | Purpose |
|------|---------|
| `task-definition.json` | ECS task definition |
| `deploy.sh` | Deployment script |

## Monitoring

- CloudWatch Logs: `/ecs/nexnum-api`
- CloudWatch Metrics: ECS service metrics
- Health check: `/api/health`
