# Kubernetes Manifests

Production Kubernetes deployment manifests for NexNum API.

## Files

| File | Purpose |
|------|---------|
| `deployment.yaml` | App deployment with health checks |
| `service.yaml` | ClusterIP service + Ingress |
| `hpa.yaml` | Autoscaling + PodDisruptionBudget |
| `secrets.yaml.template` | Secrets template (don't commit real values) |

## Quick Deploy

```bash
# Create namespace
kubectl create namespace nexnum

# Create secrets (from .env file)
kubectl create secret generic nexnum-secrets \
  --from-env-file=.env.production \
  -n nexnum

# Apply manifests
kubectl apply -f infra/k8s/ -n nexnum

# Check status
kubectl get pods -n nexnum
kubectl get svc -n nexnum
```

## Update Image

```bash
kubectl set image deployment/nexnum-api \
  nexnum-api=your-registry/nexnum-api:v1.0.1 \
  -n nexnum
```

## Rollback

```bash
kubectl rollout undo deployment/nexnum-api -n nexnum
```
