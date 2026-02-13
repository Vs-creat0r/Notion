from dotenv import load_dotenv
import os
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

print(f"Connecting to {url} with key {key[:10]}...")

supabase: Client = create_client(url, key)

try:
    print("Attempting to insert name 'Test Name'...")
    response = supabase.table("names").insert({"name": "Test Name"}).execute()
    print("Success:", response.data)
except Exception as e:
    print("Failed:", e)
