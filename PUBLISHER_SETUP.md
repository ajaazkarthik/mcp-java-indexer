# How to Fix the 404 Error - Publisher Account Setup Required

## The Issue

The extension shows as published but returns 404 because the **publisher account hasn't been created/verified** on the VS Code Marketplace yet.

---

## Step-by-Step Fix

### Step 1: Create a Microsoft Account (if you don't have one)
1. Go to: https://account.microsoft.com
2. Sign up or sign in
3. Make sure you're signed in for the next steps

### Step 2: Create Publisher on VS Code Marketplace
1. Go to: https://marketplace.visualstudio.com/manage
2. Click: **"Create Publisher"** (or **"Publish Extensions"**)
3. Enter Publisher Name: `ubanishathanvenkatesan`
4. Accept terms and create

### Step 3: Verify Your Publisher Account
1. You'll receive verification email
2. Click the verification link
3. Your publisher account is now verified

### Step 4: Create or Update Personal Access Token (PAT)
1. Go to: https://dev.azure.com
2. Sign in with your Microsoft account
3. Click your profile → Personal access tokens
4. Click: "New Token"
5. Settings:
   - Name: `vsce-publisher`
   - Organization: Select your org (or all accessible)
   - Scopes: Select "Marketplace" → "Manage"
   - Expiration: 90 days or custom
6. Click "Create"
7. **Copy the token immediately** (you can only see it once!)

### Step 5: Store Your New PAT Securely
```
Your new PAT: [paste your token here]
```

### Step 6: Publish the Extension with New PAT
```powershell
cd "D:\workspace\repo\github-playground\mcp-java-indexer"
vsce publish --no-dependencies --pre-release -p "YOUR_NEW_PAT_HERE"
```

Replace `YOUR_NEW_PAT_HERE` with the token you just created.

### Step 7: Verify Publication
After publishing, check:
1. https://marketplace.visualstudio.com/manage/publishers/ubanishathanvenkatesan
2. Your extension should appear in the publisher dashboard
3. After 5-15 minutes, it should be searchable on the marketplace

---

## Marketplace Direct Links

Once published:
- Search: https://marketplace.visualstudio.com/search?term=java-indexer-mcp
- Direct: https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp
- Dashboard: https://marketplace.visualstudio.com/manage/publishers/ubanishathanvenkatesan

---

## Alternative: If You Already Have a Publisher Account

If your publisher account is already created and verified:

1. Go to: https://dev.azure.com
2. Create a new PAT with "Marketplace" → "Manage" scope
3. Copy the PAT
4. Run: `vsce publish --no-dependencies --pre-release -p "YOUR_NEW_PAT_HERE"`

---

## Common Issues

### Issue: "401 Unauthorized"
- Your PAT is invalid or expired
- Create a new PAT with correct scopes

### Issue: "403 Forbidden"  
- You don't have permission to publish under that publisher
- Make sure you're using the correct publisher name

### Issue: "Publisher not found"
- Publisher account doesn't exist yet
- Create it at: https://marketplace.visualstudio.com/manage

### Issue: Still 404 after publishing
- Extension needs 5-15 minutes to be indexed
- Try searching instead of direct URL
- Check your publisher dashboard to confirm it's there

---

## Quick Command After Setup

Once you have the new PAT:

```powershell
$pat = "YOUR_NEW_PAT_HERE"
vsce publish --no-dependencies --pre-release -p $pat
```

---

## Still Not Working?

1. Check your publisher dashboard: https://marketplace.visualstudio.com/manage/publishers/ubanishathanvenkatesan
2. Verify the extension appears there
3. Check for any error messages or rejection reasons
4. Make sure your PAT has "Marketplace" → "Manage" scope
5. Try publishing without `--pre-release` flag first as a test

---

**Next:** Once you create the publisher and get a new PAT, reply with the new token and I'll help you publish correctly!
