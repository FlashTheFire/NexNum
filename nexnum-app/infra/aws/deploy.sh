#!/bin/bash
# AWS ECS Deployment Script
# Usage: ./deploy.sh [staging|production] [version]

set -e

ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}

# Configuration
AWS_REGION="us-east-1"
ECR_REPO="nexnum-api"
ECS_CLUSTER="nexnum-${ENVIRONMENT}"
ECS_SERVICE="nexnum-api"
TASK_FAMILY="nexnum-api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Deploying NexNum to ${ENVIRONMENT}...${NC}"

# 1. Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

# 2. Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URI}

# 3. Build and push image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t ${ECR_REPO}:${VERSION} .
docker tag ${ECR_REPO}:${VERSION} ${ECR_URI}:${VERSION}

echo -e "${YELLOW}Pushing to ECR...${NC}"
docker push ${ECR_URI}:${VERSION}

# 4. Update task definition with new image
echo -e "${YELLOW}Updating task definition...${NC}"
TASK_DEF=$(cat infra/aws/task-definition.json | \
  sed "s|ACCOUNT_ID|${AWS_ACCOUNT_ID}|g" | \
  sed "s|REGION|${AWS_REGION}|g" | \
  sed "s|:latest|:${VERSION}|g")

NEW_TASK_DEF=$(echo ${TASK_DEF} | aws ecs register-task-definition \
  --cli-input-json "file:///dev/stdin" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

# 5. Update ECS service
echo -e "${YELLOW}Updating ECS service...${NC}"
aws ecs update-service \
  --cluster ${ECS_CLUSTER} \
  --service ${ECS_SERVICE} \
  --task-definition ${NEW_TASK_DEF} \
  --force-new-deployment

# 6. Wait for deployment
echo -e "${YELLOW}Waiting for deployment to complete...${NC}"
aws ecs wait services-stable \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE}

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "Image: ${ECR_URI}:${VERSION}"
