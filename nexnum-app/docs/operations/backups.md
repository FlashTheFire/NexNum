# Database Backup & Recovery Procedures

## 1. Automated Backups

The backup system is designed to run automatically via cron, generating daily snapshots of the PostgreSQL database.

### Backup Script
Location: `scripts/backup-db.sh`

**Features:**
- Full database dump using `pg_dump`
- GZIP compression
- 30-day retention policy (auto-deletes older backups)
- Optional S3 upload

### Setup Instructions

1.  **Permissions**
    Ensure the script is executable:
    ```bash
    chmod +x /path/to/nexnum-app/scripts/backup-db.sh
    ```

2.  **Environment Variables**
    The script uses the standard PostgreSQL environment variables. Ensure these are available in the cron environment or hardcoded if necessary (though `.env` loading is preferred).
    - `DATABASE_HOST`
    - `DATABASE_PORT`
    - `DATABASE_NAME`
    - `DATABASE_USER`
    - `DATABASE_PASSWORD`

3.  **Cron Job**
    Add the following line to the crontab (`crontab -e`) to run daily at 2 AM:
    ```bash
    0 2 * * * /path/to/nexnum-app/scripts/backup-db.sh >> /var/log/nexnum-backup.log 2>&1
    ```

## 2. Restore Procedure

To restore from a backup file:

1.  **Stop the Application**
    To prevent data inconsistency, briefly stop the Next.js application or put it in maintenance mode.

2.  **Decompress and Restore**
    ```bash
    # Unzip the backup
    gunzip -c /var/backups/nexnum/nexnum_backup_YYYY-MM-DD_HH-MM-SS.sql.gz > restore.sql

    # Drop existing connections (optional but recommended)
    # psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nexnum';"

    # Restore using psql
    psql -h <HOST> -U <USER> -d <DB_NAME> -f restore.sql
    ```

3.  **Verify Data**
    Check key tables to ensure data count matches expectations.

## 3. Offsite Backups (S3)

To enable S3 uploads, configure the following environment variables in the script or system:
- `AWS_S3_BUCKET`: The destination bucket name.
- Standard AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) must be configured in `~/.aws/credentials` or exported in the environment.

Uncomment the S3 section in `scripts/backup-db.sh` to enable this feature.
