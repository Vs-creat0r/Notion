# How to Automatically Add Entries to Google Sheets (via n8n)

You asked to **create only one record** (append to a master sheet) instead of generating new files daily. Here is how to do it! 🚀

## 1. Get n8n Webhook URL
1.  Open your **n8n** workflow editor.
2.  Add a **Webhook** node.
    *   **HTTP Method**: `POST`
    *   **Path**: `site-follow-up`
    *   **Authentication**: None (or use Header Auth)
3.  Activate the workflow (or use "Test URL" for testing).
4.  Copy the **Production URL** (e.g., `https://n8n.your-domain.com/webhook/site-follow-up`).

## 2. Configure Your App
The app is now updated to look for a specific environment variable.

1.  **Local Testing (`.env`)**:
    Add this line to your `.env` file:
    ```
    N8N_WEBHOOK_URL=https://your-n8n-url/webhook/...
    ```

2.  **Vercel (Production)**:
    Go to Vercel Dashboard → Settings → Environment Variables.
    Add `N8N_WEBHOOK_URL` with your production webhook URL.
    **Redeploy** for it to take effect.

## 3. Configure n8n Workflow
Connect the Webhook node to a **Google Sheets** node:

1.  **Node**: **Google Sheets**
2.  **Operation**: **Append or Update** (or just "Append").
3.  **Spreadsheet ID**: Select your "Master Site Log" sheet.
4.  **Mapping**:
    Map the incoming JSON fields from the webhook to your columns.
    *   `Date` → `{{ $json.date }}`
    *   `Time` → `{{ $json.timestamp }}`
    *   `Name` → `{{ $json.name }}`
    *   `Location` → `{{ $json.area_name }}`
    *   `Extracted Text` → `{{ $json.extracted_text }}`
    
    **For Photos (Google Drive):**
    The app now sends `photo_urls` (a list of links). To upload them to Drive:
    1.  Add a **Loop Over Items** node (or Split in Batches) connected to Webhook.
        *   Input: `photo_urls`
    2.  Inside Loop: Add **HTTP Request** node (GET method) to download the image binary.
    3.  Add **Google Drive** node (Upload) to save the file.
    4.  **Aggregate** the Google Drive WebViewLinks (using an array or text join).
    5.  Pass the joined links to the **Google Sheets** node `Photo URL` column.

## 4. Test It!
1.  Submit an entry on your website.
2.  Check n8n execution log.
3.  See the new row appear in your Google Sheet! 🎉

---

**Result:**
You will have one single Google Sheet that fills up automatically every day. No manual work needed!
