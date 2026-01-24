# Infrastructure

Deployment infrastructure for NexNum.

## Directory Structure

```
infra/
├── aws/                    # AWS ECS deployment (recommended)
│   ├── task-definition.json
│   ├── deploy.sh
│   └── README.md
├── k8s/                    # Kubernetes manifests (alternative)
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml
└── README.md
```

## Deployment Options

### 1. AWS ECS + Docker (Recommended)

**Primary deployment method using AWS Fargate.**

```bash
# Deploy to staging
./infra/aws/deploy.sh staging v1.0.0

# Deploy to production
./infra/aws/deploy.sh production v1.0.0
```

See [aws/README.md](./aws/README.md) for full setup.

### 2. Docker Compose (Self-hosted/VPS)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Kubernetes (Alternative)

See [k8s/README.md](./k8s/README.md)

## Resource Requirements

| Component | CPU | Memory |
|-----------|-----|--------|
| API (per task) | 0.5 vCPU | 1024 MB |
| Worker | 0.25 vCPU | 512 MB |

