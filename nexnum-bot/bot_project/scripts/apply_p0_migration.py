import sys
import os
import psycopg

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

from dotenv import load_dotenv
load_dotenv("D:/Nex-Projects/NexNum/.env")

from utils.config import DATABASE_URL, sanitize_db_url

def main():
    url = sanitize_db_url(DATABASE_URL)
    print(f"Connecting to database: {url.split('@')[-1]}")
    sql_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "migrations", "bot_schema.sql"))
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    print("Executing bot_schema.sql...")
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print("Migration bot_schema.sql executed successfully!")

if __name__ == "__main__":
    main()
