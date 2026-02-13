# Deploying to Vercel via GitHub

Since you have pushed the code to GitHub (`site-follow-up` branch), deployment is easy!

## 1. Connect Vercel to GitHub
1.  Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **"Add New..."** -> **"Project"**.
3.  Connect your GitHub account if not already done.
4.  Find the repository **`Vs-creat0r/Notion`** and click **Import**.

## 2. Configure Project
1.  **Framework Preset**: Select **Other**.
2.  **Root Directory**: Leave as `./` (or select the folder if it's inside a valid repo structure).
    *   *Note*: Since you pushed the `site-follow-up` folder content to the branch root, allow Vercel to deploy from root.
3.  **Environment Variables**:
    *   Expand the "Environment Variables" section.
    *   Copy these from your local `.env` and add them:
        *   `SUPABASE_URL`
        *   `SUPABASE_KEY`

## 3. Select Branch
1.  In the **"Deploy"** section, make sure the **Production Branch** is set to `site-follow-up` (or edit the settings later to point to this branch if `main` is default).
2.  Click **Deploy**.

## Alternative: Deploy via CLI
Since you have `vercel` installed locally:
1.  Open terminal in your project folder.
2.  Run:
    ```powershell
    vercel --prod
    ```
3.  Follow the prompts. It will read your local `.env` and deploy instantly.
