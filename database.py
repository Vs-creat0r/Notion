import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

supabase: Client = None

if url and key:
    supabase = create_client(url, key)

def get_db():
    """Check if Supabase is configured."""
    if not supabase:
        raise Exception("Supabase credentials not found in .env")
    return supabase

# ── Name CRUD ──────────────────────────────────────────────

def create_name(name):
    try:
        data = {"name": name}
        response = get_db().table("names").insert(data).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        print(f"Error creating name: {e}")
        return None

def get_all_names():
    try:
        response = get_db().table("names").select("*").order("name").execute()
        return response.data
    except Exception as e:
        print(f"Error fetching names: {e}")
        return []

def update_name(name_id, new_name):
    try:
        response = get_db().table("names").update({"name": new_name}).eq("id", name_id).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        print(f"Error updating name: {e}")
        return None

def delete_name(name_id):
    try:
        get_db().table("names").delete().eq("id", name_id).execute()
        return True
    except Exception as e:
        print(f"Error deleting name: {e}")
        return False

# ── Entry CRUD ─────────────────────────────────────────────

def create_entry(name, location_lat, location_lng, area_name, photo_filename, extracted_text, timestamp, date):
    try:
        data = {
            "name": name,
            "location_lat": location_lat,
            "location_lng": location_lng,
            "area_name": area_name,
            "photo_filename": photo_filename,
            "extracted_text": extracted_text,
            "timestamp": timestamp,
            "date": date
        }
        response = get_db().table("entries").insert(data).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        print(f"Error creating entry: {e}")
        return None

def get_all_entries():
    try:
        response = get_db().table("entries").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching entries: {e}")
        return []

def get_entries_by_date(date):
    try:
        response = get_db().table("entries").select("*").eq("date", date).order("timestamp").execute()
        return response.data
    except Exception as e:
        print(f"Error fetching entries by date: {e}")
        return []

def delete_entry(entry_id):
    try:
        # First get the entry to know the filename
        response = get_db().table("entries").select("photo_filename").eq("id", entry_id).execute()
        if not response.data:
            return None
        
        row = response.data[0]
        
        # Delete from DB
        get_db().table("entries").delete().eq("id", entry_id).execute()
        
        return row
    except Exception as e:
        print(f"Error deleting entry: {e}")
        return None

def get_all_dates():
    """Get all unique dates that have entries."""
    try:
        # Supabase doesn't support SELECT DISTINCT easily on client side without unique()
        # So we fetch all dates and distinct in python for simplicity
        response = get_db().table("entries").select("date").order("date", desc=True).execute()
        dates = [r['date'] for r in response.data]
        return list(dict.fromkeys(dates)) # Remove duplicates preserving order
    except Exception as e:
        print(f"Error fetching dates: {e}")
        return []
