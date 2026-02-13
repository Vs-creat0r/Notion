from dotenv import load_dotenv
import os
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(url, key)

try:
    print("Cleaning up 'Test Name'...")
    response = supabase.table("names").delete().eq("name", "Test Name").execute()
    print("Deleted:", response.data)
except Exception as e:
    print("Failed cleanup:", e)
